// People and username invitations as one flow: the 2026110101 migration run for real in PGlite. Every call is made as a
// specific signed-in user (or anon) with Row Level Security on; the database owner only sets up state or moves time.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, newId, runMigration,
} from './harness.js';

const MIGRATION = '2026110101_people_invites_account_deletion.sql';
const ROLLBACK = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rollbacks', '2026110101_people_invites_account_deletion.down.sql'),
  'utf8',
);

const rows = async (db, user, sql, params = []) => (await as(db, user, (tx) => tx.query(sql, params))).rows;
const value = async (db, user, sql, params = []) => (await rows(db, user, sql, params))[0]?.value;
const count = async (db, user, sql, params = []) => Number((await rows(db, user, sql, params))[0].count);
const chooseName = (db, user, handle) => as(db, user, (tx) => tx.query('select set_username($1)', [handle]));
const createGroup = (db, user, name = 'Goa trip', id = newId()) => value(
  db, user, 'select create_group($1, $2, $3) as value', [id, name, 'INR'],
);
const find = (db, user, groupId, handle) => value(db, user, 'select find_invitee($1, $2) as value', [groupId, handle]);
const addByUsername = (db, user, groupId, handle) => value(
  db, user, 'select add_person_by_username($1, $2) as value', [groupId, handle],
);
const addMe = (db, user, groupId, personId = null) => value(
  db, user, 'select add_me_to_group($1, $2) as value', [groupId, personId],
);
const accept = (db, user, id) => value(db, user, 'select accept_invitation($1) as value', [id]);
const decline = (db, user, id) => value(db, user, 'select decline_invitation($1) as value', [id]);
const people = (db, user, groupId) => rows(db, user, 'select * from list_group_people($1)', [groupId]);
const addGuest = (db, user, groupId, name) => as(db, user, (tx) => tx.query(
  'insert into group_people (group_id, name) values ($1, $2)', [groupId, name],
));
const avatarFor = (user) => `https://abc.supabase.co/storage/v1/object/public/avatars/${user.id}/${newId()}.jpg`;

async function setup() {
  const db = await createDatabase();
  const owner = await createUser(db, 'Asha Rao');
  const friend = await createUser(db, 'Ben');
  const other = await createUser(db, 'Chitra');
  const stranger = await createUser(db, 'Stranger');
  await chooseName(db, owner, 'asha_rao');
  await chooseName(db, friend, 'ben_k');
  await chooseName(db, other, 'chitra');
  await chooseName(db, stranger, 'stranger_one');
  const created = await createGroup(db, owner);
  return {
    db, owner, friend, other, stranger, groupId: created.id, created,
  };
}

describe('creating a group', () => {
  it('adds the creator as the first person, linked to their account, in the same transaction', async () => {
    const { db, owner, groupId, created } = await setup();
    expect(created).toMatchObject({ id: groupId, person_name: 'Asha Rao' });
    expect(await rows(db, owner, 'select name, user_id from group_people where group_id = $1', [groupId]))
      .toEqual([{ name: 'Asha Rao', user_id: owner.id }]);
    expect(await rows(db, owner, 'select role from group_members where group_id = $1', [groupId])).toEqual([{ role: 'owner' }]);
    expect((await rows(db, owner, 'select action from activity_log where group_id = $1 order by id', [groupId])).map((r) => r.action))
      .toEqual(['group_created', 'person_added']);
    expect(await people(db, owner, groupId)).toMatchObject([{
      name: 'Asha Rao', user_id: owner.id, member_role: 'owner', username: 'asha_rao', invitation_status: null,
    }]);
  });

  it('can pay for and share expenses at once', async () => {
    const { db, owner, groupId } = await setup();
    await addGuest(db, owner, groupId, 'Dev');
    expect(await errorAs(db, owner, (tx) => tx.query(
      `insert into expenses (group_id, description, amount_cents, payer, split_details)
       values ($1, 'Taxi', 1000, 'Asha Rao', '{"Asha Rao": 500, "Dev": 500}')`, [groupId],
    ))).toBeNull();
  });

  it('uses a tidy display name, or the @username when there is none', async () => {
    const db = await createDatabase();
    const spaced = await createUser(db, '  Priya   Sharma  ');
    const nameless = await createUser(db, '');
    await chooseName(db, nameless, 'quiet_one');
    expect((await createGroup(db, spaced)).person_name).toBe('Priya Sharma');
    expect((await createGroup(db, nameless)).person_name).toBe('quiet_one');
    const long = await createUser(db, 'A'.repeat(39) + ' Z');
    expect((await createGroup(db, long)).person_name).toBe('A'.repeat(39));
  });

  it('is for signed-in users only, and owned by the caller', async () => {
    const { db } = await setup();
    expect(await errorAs(db, null, (tx) => tx.query("select create_group($1, 'X', 'INR')", [newId()]))).toMatch(/permission denied/);
    const group = await createGroup(db, (await createUser(db, 'Zed')), 'Mine');
    expect((await db.query('select created_by from groups where id = $1', [group.id])).rows[0].created_by).toBeTruthy();
  });

  it('leaves groups imported from a device as they were (no automatic person)', async () => {
    const { db, owner } = await setup();
    const imported = await value(db, owner, 'select import_group($1) as value', [JSON.stringify({ name: 'Old', people: ['Asha'] })]);
    expect(await rows(db, owner, 'select name, user_id from group_people where group_id = $1', [imported]))
      .toEqual([{ name: 'Asha', user_id: null }]);
  });
});

describe('the owner including themselves later', () => {
  async function oldGroup(db, owner) {
    const groupId = newId();
    await as(db, owner, async (tx) => {
      await tx.query("insert into groups (id, name, created_by) values ($1, 'Older group', $2)", [groupId, owner.id]);
      await tx.query("insert into group_people (group_id, name) values ($1, 'Asha'), ($1, 'Ben')", [groupId]);
    });
    return groupId;
  }

  it('adds the owner as a new person, or links them to the person they already were', async () => {
    const { db, owner } = await setup();
    const groupId = await oldGroup(db, owner);
    expect(await addMe(db, owner, groupId)).toMatchObject({ person_name: 'Asha Rao' });
    expect(await addMe(db, owner, groupId)).toEqual({ error: 'You are already in this group as Asha Rao' });

    const second = await oldGroup(db, owner);
    const asha = (await rows(db, owner, "select id from group_people where group_id = $1 and name = 'Asha'", [second]))[0].id;
    expect(await addMe(db, owner, second, asha)).toEqual({ person_id: asha, person_name: 'Asha' });
    expect(await rows(db, owner, 'select name from group_people where group_id = $1 and user_id = $2', [second, owner.id]))
      .toEqual([{ name: 'Asha' }]);
  });

  it('refuses a name already taken, a person with a pending invitation, and anyone but the owner', async () => {
    const { db, owner, friend } = await setup();
    const groupId = await oldGroup(db, owner);
    await addGuest(db, owner, groupId, 'asha rao');
    expect((await addMe(db, owner, groupId)).error).toMatch(/already in this group\. If that is you, link yourself/);
    const ben = (await rows(db, owner, "select id from group_people where group_id = $1 and name = 'Ben'", [groupId]))[0].id;
    await value(db, owner, "select invite_by_username($1, $2, 'ben_k') as value", [groupId, ben]);
    expect(await addMe(db, owner, groupId, ben)).toEqual({ error: 'Ben has a pending invitation. Revoke it first.' });
    for (const user of [friend, null]) {
      expect(await errorAs(db, user, (tx) => tx.query('select add_me_to_group($1)', [groupId])))
        .toMatch(/Only the group owner|permission denied/);
    }
  });

  it('lets the owner take only their own person out of the expenses, and only when settled', async () => {
    const { db, owner, friend, groupId } = await setup();
    await addGuest(db, owner, groupId, 'Dev');
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    await accept(db, friend, sent.invitation_id);
    await as(db, owner, (tx) => tx.query(`insert into expenses (group_id, description, amount_cents, payer, split_details)
      values ($1, 'Lunch', 1000, 'Asha Rao', '{"Asha Rao": 500, "Dev": 500}')`, [groupId]));
    const remove = (user, name) => errorAs(db, user, (tx) => tx.query(
      'delete from group_people where group_id = $1 and name = $2', [groupId, name],
    ));
    expect(await remove(owner, 'Asha Rao')).toMatch(/still owes or is owed money/);
    await as(db, owner, (tx) => tx.query("insert into payments (group_id, payer, payee, amount_cents) values ($1, 'Dev', 'Asha Rao', 500)", [groupId]));
    expect(await remove(friend, 'Ben')).toMatch(/linked to a member's account/); // a member cannot drop themselves
    expect(await remove(owner, 'Ben')).toMatch(/linked to a member's account/); // nor the owner someone else
    expect(await remove(owner, 'Asha Rao')).toBeNull();
    expect(await count(db, owner, 'select count(*) from groups where id = $1', [groupId])).toBe(1); // still the owner
    expect(await addMe(db, owner, groupId)).toMatchObject({ person_name: 'Asha Rao' }); // and can come back
  });
});

describe('finding someone by username', () => {
  it('shows only public details: display name, @username and their own photo, never an email', async () => {
    const { db, owner, friend, groupId } = await setup();
    const photo = avatarFor(friend);
    await db.query('update profiles set avatar_url = $1 where id = $2', [photo, friend.id]);
    const result = await find(db, owner, groupId, '  @Ben_K ');
    expect(result).toEqual({
      status: 'available', username: 'ben_k', display_name: 'Ben', avatar_url: photo, person_name: 'Ben',
    });
    expect(JSON.stringify(result)).not.toMatch(/example\.com/);
  });

  it('never passes on a photo link that is not the account\'s own upload', async () => {
    const { db, owner, friend, groupId } = await setup();
    await db.exec('alter table profiles disable trigger profiles_check_avatar_url');
    await db.query("update profiles set avatar_url = 'https://evil.example/track.gif' where id = $1", [friend.id]);
    await db.exec('alter table profiles enable trigger profiles_check_avatar_url');
    expect((await find(db, owner, groupId, 'ben_k')).avatar_url).toBeNull();
  });

  it('explains malformed, unknown and unchosen usernames without revealing anything else', async () => {
    const { db, owner, friend, groupId } = await setup();
    const fresh = await createUser(db, 'Fresh');
    const provisional = (await db.query('select username from profiles where id = $1', [fresh.id])).rows[0].username;
    expect(await find(db, owner, groupId, 'a')).toEqual({ status: 'invalid' });
    expect(await find(db, owner, groupId, friend.email)).toEqual({ status: 'invalid' });
    for (const handle of ['nobody_here', 'admin', provisional]) {
      expect(await find(db, owner, groupId, handle), handle).toEqual({ status: 'not_found' });
    }
  });

  it('reports yourself, people already in the group, pending invitations, a recent decline and earlier invitations', async () => {
    const { db, owner, friend, other, stranger, groupId } = await setup();
    expect(await find(db, owner, groupId, 'asha_rao')).toMatchObject({ status: 'self', person_name: 'Asha Rao' });
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    expect(await find(db, owner, groupId, 'ben_k')).toMatchObject({ status: 'pending', person_name: 'Ben' });
    await accept(db, friend, sent.invitation_id);
    expect(await find(db, owner, groupId, 'ben_k')).toMatchObject({ status: 'member', person_name: 'Ben' });

    const chitra = await addByUsername(db, owner, groupId, 'chitra');
    await decline(db, other, chitra.invitation_id);
    expect(await find(db, owner, groupId, 'chitra')).toMatchObject({ status: 'cooldown', retry_on: expect.stringMatching(/^\d{1,2} \w{3} \d{4}$/) });
    await db.query("update group_invitations set responded_at = now() - interval '8 days' where id = $1", [chitra.invitation_id]);
    expect(await find(db, owner, groupId, 'chitra')).toMatchObject({ status: 'invited_before', person_name: 'Chitra', last_status: 'declined' });

    const later = await addByUsername(db, owner, groupId, 'stranger_one');
    await db.query("update group_invitations set expires_at = now() - interval '1 minute' where id = $1", [later.invitation_id]);
    expect(await find(db, owner, groupId, 'stranger_one')).toMatchObject({ status: 'invited_before', last_status: 'expired' });
    expect(stranger).toBeTruthy();
  });

  it('is for the group owner only, and rate limited', async () => {
    const { db, owner, friend, stranger, groupId } = await setup();
    for (const user of [friend, stranger]) {
      expect(await errorAs(db, user, (tx) => tx.query("select find_invitee($1, 'ben_k')", [groupId])))
        .toBe('Only the group owner can add people by username');
    }
    expect(await errorAs(db, null, (tx) => tx.query("select find_invitee($1, 'ben_k')", [groupId]))).toMatch(/permission denied/);
    for (let i = 0; i < 30; i += 1) await find(db, owner, groupId, `nobody_${i}`);
    expect(await errorAs(db, owner, (tx) => tx.query("select find_invitee($1, 'ben_k')", [groupId]))).toMatch(/Too many attempts/);
  });
});

describe('adding someone by username', () => {
  it('creates their person and the invitation together; the person is usable before they join, with no access', async () => {
    const { db, owner, friend, groupId } = await setup();
    const sent = await addByUsername(db, owner, groupId, '@Ben_K');
    expect(sent).toMatchObject({ person_name: 'Ben', status: 'pending', username: 'ben_k', display_name: 'Ben' });
    expect(await people(db, owner, groupId)).toMatchObject([
      { name: 'Asha Rao', member_role: 'owner' },
      { name: 'Ben', user_id: null, invitation_status: 'pending', invitee_username: 'ben_k', invitation_id: sent.invitation_id },
    ]);
    // Someone can pay for a friend who has not joined yet.
    expect(await errorAs(db, owner, (tx) => tx.query(
      `insert into expenses (group_id, description, amount_cents, payer, split_details)
       values ($1, 'Tickets', 2000, 'Asha Rao', '{"Asha Rao": 1000, "Ben": 1000}')`, [groupId],
    ))).toBeNull();
    // Ben's account sees nothing of the group until it accepts.
    for (const table of ['groups', 'group_people', 'expenses', 'activity_log']) {
      expect(await count(db, friend, `select count(*) from ${table}`), table).toBe(0);
    }
    expect(await errorAs(db, friend, (tx) => tx.query('select * from list_group_people($1)', [groupId])))
      .toBe('You are not a member of this group');
    expect(await rows(db, friend, 'select group_name, person_name, invited_by_name from list_my_invitations()'))
      .toEqual([{ group_name: 'Goa trip', person_name: 'Ben', invited_by_name: 'Asha Rao' }]);
  });

  it('accepting links that same person: no duplicate person, the expenses are now theirs', async () => {
    const { db, owner, friend, groupId } = await setup();
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    await as(db, owner, (tx) => tx.query(`insert into expenses (group_id, description, amount_cents, payer, split_details)
      values ($1, 'Tickets', 2000, 'Asha Rao', '{"Asha Rao": 1000, "Ben": 1000}')`, [groupId]));
    expect(await accept(db, friend, sent.invitation_id)).toEqual({ group_id: groupId, person_name: 'Ben', status: 'accepted' });
    expect(await accept(db, friend, sent.invitation_id)).toMatchObject({ status: 'accepted' });
    expect((await db.query('select name, user_id from group_people where group_id = $1 order by created_at', [groupId])).rows)
      .toEqual([{ name: 'Asha Rao', user_id: owner.id }, { name: 'Ben', user_id: friend.id }]);
    expect(await rows(db, friend, 'select name, balance_cents from group_balances($1) order by name', [groupId]))
      .toEqual([{ name: 'Asha Rao', balance_cents: 1000 }, { name: 'Ben', balance_cents: -1000 }]);
    expect(await people(db, friend, groupId)).toMatchObject([
      { name: 'Asha Rao', member_role: 'owner', username: 'asha_rao' },
      { name: 'Ben', member_role: 'member', username: 'ben_k', invitation_status: null },
    ]);
  });

  it('picks a free name when theirs is already used by a guest', async () => {
    const { db, owner, groupId } = await setup();
    await addGuest(db, owner, groupId, 'ben');
    expect((await addByUsername(db, owner, groupId, 'ben_k')).person_name).toBe('Ben (@ben_k)');
  });

  it('refuses yourself, people already added or invited, a recent decline and an earlier unresolved invitation', async () => {
    const { db, owner, friend, other, groupId } = await setup();
    expect(await addByUsername(db, owner, groupId, 'asha_rao')).toEqual({ error: 'You are already in this group as Asha Rao' });
    expect(await addByUsername(db, owner, groupId, 'nobody_here')).toEqual({ error: 'No account has that username' });
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    expect(await addByUsername(db, owner, groupId, 'ben_k')).toEqual({ error: '@ben_k already has a pending invitation (as Ben)' });
    await accept(db, friend, sent.invitation_id);
    expect(await addByUsername(db, owner, groupId, 'ben_k')).toEqual({ error: '@ben_k is already in this group as Ben' });

    const chitra = await addByUsername(db, owner, groupId, 'chitra');
    await decline(db, other, chitra.invitation_id);
    expect((await addByUsername(db, owner, groupId, 'chitra')).error).toMatch(/^@chitra declined recently\. You can invite them again on /);
    await db.query("update group_invitations set responded_at = now() - interval '8 days' where id = $1", [chitra.invitation_id]);
    expect(await addByUsername(db, owner, groupId, 'chitra'))
      .toEqual({ error: '@chitra was invited before as Chitra. Use Resend on Chitra in the people list.' });
    expect(await count(db, owner, "select count(*) from group_people where group_id = $1 and name ilike 'chitra%'", [groupId])).toBe(1);
  });

  it('can be resent to the same person after an expiry, and the owner can keep the person as a guest instead', async () => {
    const { db, owner, friend, groupId } = await setup();
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    await db.query("update group_invitations set expires_at = now() - interval '1 minute' where id = $1", [sent.invitation_id]);
    expect((await people(db, owner, groupId))[1]).toMatchObject({ invitation_status: 'expired', invitee_username: 'ben_k' });
    const again = await value(db, owner, "select invite_by_username($1, $2, 'ben_k') as value", [groupId, sent.person_id]);
    expect(again).toMatchObject({ status: 'pending', person_name: 'Ben' });

    expect(await value(db, owner, 'select keep_person_as_guest($1) as value', [sent.person_id])).toEqual({ status: 'guest' });
    expect((await people(db, owner, groupId))[1]).toMatchObject({ name: 'Ben', user_id: null, invitation_status: null });
    expect(await accept(db, friend, again.id)).toEqual({ error: 'This invitation was revoked' });
    // Kept as a guest, they can be added again as a separate person if the owner wants.
    expect(await addByUsername(db, owner, groupId, 'ben_k')).toMatchObject({ person_name: 'Ben (@ben_k)' });
  });

  it('is for the owner only; members, strangers and visitors cannot add, keep as guest or see invitation details', async () => {
    const { db, owner, friend, stranger, groupId } = await setup();
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    await accept(db, friend, sent.invitation_id);
    const pending = await addByUsername(db, owner, groupId, 'chitra');
    for (const user of [friend, stranger]) {
      expect(await errorAs(db, user, (tx) => tx.query("select add_person_by_username($1, 'stranger_one')", [groupId])))
        .toBe('Only the group owner can invite people');
      expect(await errorAs(db, user, (tx) => tx.query('select keep_person_as_guest($1)', [pending.person_id])))
        .toBe('Person not found');
    }
    // A member sees that Chitra is invited, but not who the invitation is for.
    expect((await people(db, friend, groupId)).find((row) => row.name === 'Chitra')).toMatchObject({
      invitation_status: 'pending', invitation_id: null, invitee_username: null, invitee_name: null, username: null,
    });
    expect(await errorAs(db, stranger, (tx) => tx.query('select * from list_group_people($1)', [groupId])))
      .toBe('You are not a member of this group');
    for (const sql of [
      ["select add_person_by_username($1, 'ben_k')", [groupId]],
      ['select keep_person_as_guest($1)', [pending.person_id]],
      ['select * from list_group_people($1)', [groupId]],
    ]) {
      expect(await errorAs(db, null, (tx) => tx.query(...sql)), sql[0]).toMatch(/permission denied/);
    }
    expect(JSON.stringify(await people(db, owner, groupId))).not.toMatch(/example\.com/);
  });

  it('counts towards the 20-pending limit and the invitation rate limit', async () => {
    const db = await createDatabase();
    const owner = await createUser(db, 'Owner');
    await chooseName(db, owner, 'owner_one');
    const { id: groupId } = await createGroup(db, owner);
    for (let i = 0; i < 21; i += 1) await chooseName(db, await createUser(db, `Friend ${i}`), `friend_${i}`);
    for (let i = 0; i < 20; i += 1) expect((await addByUsername(db, owner, groupId, `friend_${i}`)).status).toBe('pending');
    expect(await addByUsername(db, owner, groupId, 'friend_20'))
      .toEqual({ error: 'This group already has 20 pending invitations. Revoke some, or wait for answers.' });
    for (let i = 0; i < 9; i += 1) await addByUsername(db, owner, groupId, `nobody_${i}`);
    expect(await errorAs(db, owner, (tx) => tx.query("select add_person_by_username($1, 'friend_20')", [groupId])))
      .toMatch(/Too many attempts/);
  });
});

describe('live invitation signals', () => {
  const stamp = async (db, user) => (await db.query('select changed_at from invitation_updates where user_id = $1', [user.id])).rows[0]?.changed_at;

  it('tell the invitee and the owner that something changed, and nothing more', async () => {
    const { db, owner, friend, groupId } = await setup();
    expect(await stamp(db, friend)).toBeUndefined();
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    const first = await stamp(db, friend);
    expect(first).toBeTruthy();
    expect(await stamp(db, owner)).toBeTruthy();
    await decline(db, friend, sent.invitation_id);
    expect(await stamp(db, friend)).not.toEqual(first);
    expect(Object.keys((await db.query('select * from invitation_updates limit 1')).rows[0]).sort()).toEqual(['changed_at', 'user_id']);
  });

  it('are readable only by their own account and writable by nobody', async () => {
    const { db, owner, friend, groupId } = await setup();
    await addByUsername(db, owner, groupId, 'ben_k');
    expect(await rows(db, friend, 'select user_id from invitation_updates')).toEqual([{ user_id: friend.id }]);
    expect(await rows(db, owner, 'select user_id from invitation_updates')).toEqual([{ user_id: owner.id }]);
    expect(await errorAs(db, friend, (tx) => tx.query('update invitation_updates set changed_at = now()'))).toMatch(/permission denied/);
    expect(await errorAs(db, friend, (tx) => tx.query('insert into invitation_updates (user_id) values ($1)', [friend.id])))
      .toMatch(/permission denied/);
    expect(await errorAs(db, null, (tx) => tx.query('select * from invitation_updates'))).toMatch(/permission denied/);
  });

  it('are sent over the existing realtime publication', async () => {
    const { db } = await setup();
    const published = (await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")).rows;
    expect(published.map((row) => row.tablename)).toEqual(['activity_log', 'groups', 'invitation_updates']);
  });
});

describe('row level security everywhere', () => {
  it('is enabled on every table in the public schema', async () => {
    const { db } = await setup();
    const tables = (await db.query(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1",
    )).rows;
    expect(tables.length).toBeGreaterThan(10);
    expect(tables.filter((table) => !table.relrowsecurity)).toEqual([]);
  });
});

describe('upgrading and rolling back', () => {
  it('leaves existing groups, people, members and balances exactly as they were', async () => {
    const db = await createDatabase({ upTo: MIGRATION.slice(0, 10) });
    const owner = await createUser(db, 'Owner');
    const groupId = newId();
    await as(db, owner, async (tx) => {
      await tx.query("insert into groups (id, name, created_by) values ($1, 'Before', $2)", [groupId, owner.id]);
      await tx.query("insert into group_people (group_id, name) values ($1, 'Asha'), ($1, 'Ben')", [groupId]);
      await tx.query(`insert into expenses (group_id, description, amount_cents, payer, split_details)
        values ($1, 'Dinner', 3000, 'Asha', '{"Asha": 1500, "Ben": 1500}')`, [groupId]);
    });
    const snapshot = async () => ({
      people: (await db.query('select id, name, user_id from group_people order by name')).rows,
      balances: (await rows(db, owner, 'select name, balance_cents from group_balances($1) order by name', [groupId])),
    });
    const before = await snapshot();
    await runMigration(db, MIGRATION);
    await runMigration(db, MIGRATION); // safe to re-run
    expect(await snapshot()).toEqual(before); // no owner silently added to an old group
    expect(await people(db, owner, groupId)).toHaveLength(2);
  });

  it('rolls back without deleting people, invitations or links, and re-applies cleanly', async () => {
    const { db, owner, friend, groupId } = await setup();
    const sent = await addByUsername(db, owner, groupId, 'ben_k');
    await accept(db, friend, sent.invitation_id);
    await db.exec(ROLLBACK);
    await db.exec(ROLLBACK);
    expect(await errorAs(db, owner, (tx) => tx.query("select create_group($1, 'X', 'INR')", [newId()]))).toMatch(/does not exist/);
    expect((await db.query('select name, user_id from group_people where group_id = $1 order by created_at', [groupId])).rows)
      .toEqual([{ name: 'Asha Rao', user_id: owner.id }, { name: 'Ben', user_id: friend.id }]);
    // The earlier rule is back: a linked person cannot be removed, not even the owner's own.
    expect(await errorAs(db, owner, (tx) => tx.query("delete from group_people where name = 'Asha Rao'"))).toMatch(/linked to a member's account/);
    // The previous app's flows still work.
    await as(db, owner, (tx) => tx.query("insert into groups (id, name, created_by) values ($1, 'Old flow', $2)", [newId(), owner.id]));

    await runMigration(db, MIGRATION);
    expect(await people(db, friend, groupId)).toHaveLength(2);
  });
});
