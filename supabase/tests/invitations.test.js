// Username invitations: the 2026103101 migration run for real in PGlite. Every call is made as a specific signed-in
// user (or anon) with Row Level Security on; the database owner is used only to set up state or move the clock.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, newId, runMigration,
} from './harness.js';

const MIGRATION = '2026103101_username_invitations.sql';
const ROLLBACK = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rollbacks', '2026103101_username_invitations.down.sql'),
  'utf8',
);

const one = async (db, user, sql, params = []) => (await as(db, user, (tx) => tx.query(sql, params))).rows[0];
const value = async (db, user, sql, params = []) => (await one(db, user, sql, params))?.value;
const count = async (db, user, sql, params = []) => Number((await one(db, user, sql, params)).count);
const chooseName = (db, user, handle) => as(db, user, (tx) => tx.query('select set_username($1)', [handle]));
const invite = (db, user, groupId, personId, handle) => value(
  db, user, 'select invite_by_username($1, $2, $3) as value', [groupId, personId, handle],
);
const accept = (db, user, id) => value(db, user, 'select accept_invitation($1) as value', [id]);
const decline = (db, user, id) => value(db, user, 'select decline_invitation($1) as value', [id]);
const revoke = (db, user, id) => value(db, user, 'select revoke_invitation($1) as value', [id]);
const balances = async (db, user, groupId) => (await as(db, user, (tx) => tx.query(
  'select name, balance_cents from group_balances($1) order by name', [groupId],
))).rows;

async function makeGroup(db, owner, people = ['Asha', 'Ben', 'Chitra'], { withIds = true } = {}) {
  const groupId = newId();
  await as(db, owner, async (tx) => {
    await tx.query("insert into groups (id, name, created_by) values ($1, 'Goa trip', $2)", [groupId, owner.id]);
    for (const person of people) await tx.query('insert into group_people (group_id, name) values ($1, $2)', [groupId, person]);
  });
  if (!withIds) return { groupId };
  const ids = Object.fromEntries((await as(db, owner, (tx) => tx.query(
    'select name, id from group_people where group_id = $1', [groupId],
  ))).rows.map((row) => [row.name, row.id]));
  return { groupId, ids };
}

async function setup() {
  const db = await createDatabase();
  const owner = await createUser(db, 'Owner');
  const friend = await createUser(db, 'Friend');
  const other = await createUser(db, 'Other');
  const stranger = await createUser(db, 'Stranger');
  await chooseName(db, owner, 'owner_one');
  await chooseName(db, friend, 'friend_one');
  await chooseName(db, other, 'other_one');
  await chooseName(db, stranger, 'stranger_one');
  const { groupId, ids } = await makeGroup(db, owner);
  await as(db, owner, async (tx) => {
    await tx.query(`insert into expenses (group_id, description, amount_cents, payer, split_details)
      values ($1, 'Dinner', 3000, 'Asha', '{"Asha": 1000, "Ben": 1000, "Chitra": 1000}')`, [groupId]);
    await tx.query("insert into payments (group_id, payer, payee, amount_cents) values ($1, 'Ben', 'Asha', 400)", [groupId]);
  });
  return {
    db, owner, friend, other, stranger, groupId, ids,
  };
}

describe('sending invitations', () => {
  it('lets the owner invite an existing account by its username, for one chosen person', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const sent = await invite(db, owner, groupId, ids.Ben, '  @Friend_One ');
    expect(sent).toMatchObject({ status: 'pending', person_name: 'Ben', username: 'friend_one', display_name: 'Friend' });
    expect(new Date(sent.expires_at) - Date.now()).toBeGreaterThan(29.9 * 24 * 3600 * 1000);
    // Nothing is shared until they accept.
    expect(await count(db, friend, 'select count(*) from groups')).toBe(0);
    const mine = (await as(db, friend, (tx) => tx.query('select * from list_my_invitations()'))).rows;
    expect(mine).toMatchObject([{
      group_name: 'Goa trip', person_name: 'Ben', invited_by_name: 'Owner', invited_by_username: 'owner_one', status: 'pending',
    }]);
  });

  it('answers unknown, invalid and unchosen usernames the same way, never revealing an email', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const fresh = await createUser(db, 'Fresh'); // still on a provisional user_ name
    const provisional = (await db.query('select username from profiles where id = $1', [fresh.id])).rows[0].username;
    for (const handle of ['nobody_here', 'a', '', 'admin', provisional, friend.email, 'friend_one; drop table groups']) {
      const result = await invite(db, owner, groupId, ids.Ben, handle);
      expect(result, handle).toEqual({ error: 'No account has that username' });
    }
    expect(JSON.stringify(await as(db, owner, (tx) => tx.query('select * from list_group_invitations($1)', [groupId]))))
      .not.toMatch(/@example\.com/);
  });

  it('refuses duplicates, self-invitations and people or accounts already linked', async () => {
    const {
      db, owner, friend, other, groupId, ids,
    } = await setup();
    await invite(db, owner, groupId, ids.Ben, 'friend_one');
    expect(await invite(db, owner, groupId, ids.Chitra, 'friend_one'))
      .toEqual({ error: '@friend_one already has a pending invitation to this group' });
    expect(await invite(db, owner, groupId, ids.Ben, 'other_one')).toEqual({ error: 'Ben already has a pending invitation' });
    expect(await invite(db, owner, groupId, ids.Asha, 'owner_one')).toEqual({ error: 'You cannot invite yourself' });

    const [pending] = (await as(db, friend, (tx) => tx.query('select id from list_my_invitations()'))).rows;
    await accept(db, friend, pending.id);
    expect(await invite(db, owner, groupId, ids.Ben, 'other_one')).toEqual({ error: 'Ben is already linked to an account' });
    expect(await invite(db, owner, groupId, ids.Chitra, 'friend_one'))
      .toEqual({ error: '@friend_one is already linked to someone in this group' });
    expect(await invite(db, owner, groupId, ids.Chitra, 'other_one')).toMatchObject({ status: 'pending' });
    expect(other).toBeTruthy();
  });

  it('only offers people of the same group', async () => {
    const {
      db, owner, groupId,
    } = await setup();
    const elsewhere = await makeGroup(db, owner, ['Zed']);
    expect(await invite(db, owner, groupId, elsewhere.ids.Zed, 'friend_one')).toEqual({ error: 'Choose a person from this group' });
    expect(await invite(db, owner, groupId, newId(), 'friend_one')).toEqual({ error: 'Choose a person from this group' });
  });

  it('allows at most 20 pending invitations per group', async () => {
    const db = await createDatabase();
    const owner = await createUser(db, 'Owner');
    const names = Array.from({ length: 21 }, (_, i) => `Person ${i + 1}`);
    const { groupId, ids } = await makeGroup(db, owner, names);
    const invitees = [];
    for (let i = 0; i < 21; i += 1) {
      const user = await createUser(db, 'Invitee');
      await chooseName(db, user, `invitee_${i + 1}`);
      invitees.push(user);
    }
    const sent = [];
    for (let i = 0; i < 20; i += 1) sent.push(await invite(db, owner, groupId, ids[names[i]], `invitee_${i + 1}`));
    expect(sent.every((item) => item.status === 'pending')).toBe(true);
    expect(await invite(db, owner, groupId, ids[names[20]], 'invitee_21'))
      .toEqual({ error: 'This group already has 20 pending invitations. Revoke some, or wait for answers.' });
    await revoke(db, owner, sent[0].id);
    expect(await invite(db, owner, groupId, ids[names[20]], 'invitee_21')).toMatchObject({ status: 'pending' });
    expect(invitees).toHaveLength(21);
  });
});

describe('answering invitations', () => {
  it('accepting links exactly the invited person and grants that group only, in one step', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const elsewhere = await makeGroup(db, owner, ['Zed']);
    const before = await balances(db, owner, groupId);
    const sent = await invite(db, owner, groupId, ids.Ben, 'friend_one');
    expect(await accept(db, friend, sent.id)).toEqual({ group_id: groupId, person_name: 'Ben', status: 'accepted' });

    const people = (await db.query('select name, user_id from group_people where group_id = $1 order by name', [groupId])).rows;
    expect(people).toEqual([
      { name: 'Asha', user_id: null }, { name: 'Ben', user_id: friend.id }, { name: 'Chitra', user_id: null },
    ]);
    expect(await count(db, friend, 'select count(*) from groups')).toBe(1);
    expect(await count(db, friend, 'select count(*) from group_people where group_id = $1', [elsewhere.groupId])).toBe(0);
    expect(await balances(db, friend, groupId)).toEqual(before); // the same money, now visible to Ben's account
    const role = (await db.query('select role from group_members where group_id = $1 and user_id = $2', [groupId, friend.id])).rows;
    expect(role).toEqual([{ role: 'member' }]);
  });

  it('is safe to retry: a second accept changes nothing and creates no duplicates', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const sent = await invite(db, owner, groupId, ids.Ben, 'friend_one');
    const first = await accept(db, friend, sent.id);
    expect(await accept(db, friend, sent.id)).toEqual(first);
    expect(Number((await db.query('select count(*) from group_members where user_id = $1', [friend.id])).rows[0].count)).toBe(1);
    expect(Number((await db.query('select count(*) from group_people where user_id = $1', [friend.id])).rows[0].count)).toBe(1);
    expect(await decline(db, friend, sent.id)).toEqual({ error: 'This invitation was accepted' });
  });

  it('declining links nothing and shares nothing', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const sent = await invite(db, owner, groupId, ids.Ben, 'friend_one');
    expect(await decline(db, friend, sent.id)).toEqual({ status: 'declined' });
    expect(await decline(db, friend, sent.id)).toEqual({ status: 'declined' });
    expect(await accept(db, friend, sent.id)).toEqual({ error: 'This invitation was declined' });
    expect(await count(db, friend, 'select count(*) from groups')).toBe(0);
    expect((await db.query("select user_id from group_people where name = 'Ben'")).rows[0].user_id).toBeNull();
  });

  it('lets only the invited account answer, and only the owner revoke', async () => {
    const {
      db, owner, friend, other, stranger, groupId, ids,
    } = await setup();
    const sent = await invite(db, owner, groupId, ids.Ben, 'friend_one');
    for (const user of [other, stranger, owner]) {
      expect(await errorAs(db, user, (tx) => tx.query('select accept_invitation($1)', [sent.id]))).toBe('Invitation not found');
      expect(await errorAs(db, user, (tx) => tx.query('select decline_invitation($1)', [sent.id]))).toBe('Invitation not found');
    }
    for (const user of [friend, stranger]) {
      expect(await errorAs(db, user, (tx) => tx.query('select revoke_invitation($1)', [sent.id]))).toBe('Invitation not found');
    }
    expect(await revoke(db, owner, sent.id)).toEqual({ status: 'revoked' });
    expect(await accept(db, friend, sent.id)).toEqual({ error: 'This invitation was revoked' });
    expect(await count(db, friend, 'select count(*) from groups')).toBe(0);
  });

  it('expires invitations after 30 days; an expired invitation cannot be accepted', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const sent = await invite(db, owner, groupId, ids.Ben, 'friend_one');
    await db.query("update group_invitations set expires_at = now() - interval '1 minute' where id = $1", [sent.id]);
    expect(await accept(db, friend, sent.id)).toEqual({ error: 'This invitation has expired. Ask the owner to invite you again.' });
    expect((await db.query('select status from group_invitations where id = $1', [sent.id])).rows[0].status).toBe('expired');
    expect(await count(db, friend, 'select count(*) from groups')).toBe(0);
    expect((await as(db, friend, (tx) => tx.query('select status from list_my_invitations()'))).rows).toEqual([{ status: 'expired' }]);
    // An expired invitation no longer blocks a new one.
    expect(await invite(db, owner, groupId, ids.Ben, 'friend_one')).toMatchObject({ status: 'pending' });
  });

  it('after a decline, the same person cannot be offered to the same account for 7 days', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    const sent = await invite(db, owner, groupId, ids.Ben, 'friend_one');
    await decline(db, friend, sent.id);
    expect((await invite(db, owner, groupId, ids.Ben, 'friend_one')).error)
      .toMatch(/^@friend_one declined recently\. You can invite them again on \d{1,2} \w{3} \d{4}$/);
    expect(await invite(db, owner, groupId, ids.Chitra, 'friend_one')).toMatchObject({ status: 'pending' }); // another person
    await db.query("update group_invitations set status = 'revoked' where person_id = $1 and status = 'pending'", [ids.Chitra]);
    await db.query("update group_invitations set responded_at = now() - interval '7 days 1 minute' where id = $1", [sent.id]);
    expect(await invite(db, owner, groupId, ids.Ben, 'friend_one')).toMatchObject({ status: 'pending' });
  });
});

describe('protection', () => {
  it('lets only the owner rename the group or change its currency', async () => {
    const {
      db, owner, friend, stranger, groupId, ids,
    } = await setup();
    await accept(db, friend, (await invite(db, owner, groupId, ids.Ben, 'friend_one')).id);
    for (const user of [friend, stranger]) {
      expect((await as(db, user, (tx) => tx.query("update groups set name = 'Hacked' where id = $1", [groupId]))).affectedRows).toBe(0);
      expect((await as(db, user, (tx) => tx.query("update groups set currency_code = 'USD' where id = $1", [groupId]))).affectedRows).toBe(0);
    }
    expect((await as(db, owner, (tx) => tx.query("update groups set name = 'Goa 2026', currency_code = 'EUR' where id = $1", [groupId]))).affectedRows).toBe(1);
    expect((await db.query('select name, currency_code from groups where id = $1', [groupId])).rows[0])
      .toEqual({ name: 'Goa 2026', currency_code: 'EUR' });
  });

  it('keeps members and strangers away from inviting and from the group\'s invitation list', async () => {
    const {
      db, owner, friend, stranger, groupId, ids,
    } = await setup();
    await accept(db, friend, (await invite(db, owner, groupId, ids.Ben, 'friend_one')).id);
    for (const user of [friend, stranger]) {
      expect(await errorAs(db, user, (tx) => tx.query("select invite_by_username($1, $2, 'other_one')", [groupId, ids.Chitra])))
        .toBe('Only the group owner can invite people');
      expect(await errorAs(db, user, (tx) => tx.query('select * from list_group_invitations($1)', [groupId])))
        .toBe('Only the group owner can see its invitations');
    }
  });

  it('gives clients no direct access to invitations or account links', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    await accept(db, friend, (await invite(db, owner, groupId, ids.Ben, 'friend_one')).id);
    for (const user of [owner, friend]) {
      expect(await errorAs(db, user, (tx) => tx.query('select * from group_invitations'))).toMatch(/permission denied/);
      expect(await errorAs(db, user, (tx) => tx.query(
        'insert into group_invitations (group_id, person_id, invitee_id) values ($1, $2, $3)', [groupId, ids.Chitra, user.id],
      ))).toMatch(/permission denied/);
      expect(await errorAs(db, user, (tx) => tx.query(
        'update group_people set user_id = $1 where id = $2', [user.id, ids.Chitra],
      ))).toMatch(/permission denied/);
      expect(await errorAs(db, user, (tx) => tx.query(
        "insert into group_people (group_id, name, user_id) values ($1, 'Claimed', $2)", [groupId, user.id],
      ))).toMatch(/permission denied/);
    }
    // Adding people by name still works for members.
    await as(db, friend, (tx) => tx.query("insert into group_people (group_id, name) values ($1, 'Dev')", [groupId]));
  });

  it('gives signed-out visitors nothing', async () => {
    const { db, groupId, ids } = await setup();
    for (const sql of [
      ["select invite_by_username($1, $2, 'friend_one')", [groupId, ids.Ben]],
      ['select accept_invitation($1)', [newId()]],
      ['select decline_invitation($1)', [newId()]],
      ['select revoke_invitation($1)', [newId()]],
      ['select * from list_my_invitations()', []],
      ['select * from list_group_invitations($1)', [groupId]],
      ['select * from list_members($1)', [groupId]],
    ]) {
      expect(await errorAs(db, null, (tx) => tx.query(...sql)), sql[0]).toMatch(/permission denied/);
    }
  });

  it('keeps a linked person until their member leaves, then unlinks them and keeps their history', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    await accept(db, friend, (await invite(db, owner, groupId, ids.Ben, 'friend_one')).id);
    await as(db, owner, (tx) => tx.query("insert into payments (group_id, payer, payee, amount_cents) values ($1, 'Asha', 'Ben', 400)", [groupId]));
    await as(db, owner, (tx) => tx.query("delete from payments where group_id = $1", [groupId]));
    expect(await errorAs(db, owner, (tx) => tx.query("delete from group_people where id = $1", [ids.Ben])))
      .toMatch(/linked to a member's account|still owes/);
    await as(db, friend, (tx) => tx.query('select remove_member($1, $2)', [groupId, friend.id]));
    expect((await db.query('select user_id from group_people where id = $1', [ids.Ben])).rows[0].user_id).toBeNull();
    expect(await count(db, friend, 'select count(*) from groups')).toBe(0);
    expect(await count(db, owner, 'select count(*) from expenses where group_id = $1', [groupId])).toBe(1);
  });

  it('still lets the owner delete a whole group with linked members and pending invitations', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    await accept(db, friend, (await invite(db, owner, groupId, ids.Ben, 'friend_one')).id);
    await invite(db, owner, groupId, ids.Chitra, 'other_one');
    expect((await as(db, owner, (tx) => tx.query('delete from groups where id = $1', [groupId]))).affectedRows).toBe(1);
    expect(Number((await db.query('select count(*) from group_invitations')).rows[0].count)).toBe(0);
    expect(Number((await db.query('select count(*) from group_people where group_id = $1', [groupId])).rows[0].count)).toBe(0);
  });

  it('rate-limits invitations per owner', async () => {
    const { db, owner, groupId, ids } = await setup();
    for (let i = 0; i < 30; i += 1) await invite(db, owner, groupId, ids.Ben, `nobody_${i}`);
    expect(await errorAs(db, owner, (tx) => tx.query("select invite_by_username($1, $2, 'friend_one')", [groupId, ids.Ben])))
      .toMatch(/Too many attempts/);
  });
});

describe('upgrading and rolling back', () => {
  it('keeps existing groups, members, expenses, payments and balances through the migration', async () => {
    const db = await createDatabase({ upTo: MIGRATION.slice(0, 10) });
    const owner = await createUser(db, 'Owner');
    const friend = await createUser(db, 'Friend');
    const { groupId } = await makeGroup(db, owner, undefined, { withIds: false });
    await as(db, owner, async (tx) => {
      await tx.query(`insert into expenses (group_id, description, amount_cents, payer, split_details)
        values ($1, 'Dinner', 3000, 'Asha', '{"Asha": 1000, "Ben": 1000, "Chitra": 1000}')`, [groupId]);
      await tx.query("insert into payments (group_id, payer, payee, amount_cents) values ($1, 'Ben', 'Asha', 400)", [groupId]);
      await tx.query('select invite_member($1, $2)', [groupId, friend.email]); // the old email flow
    });
    const before = await balances(db, owner, groupId);

    await runMigration(db, MIGRATION);
    await runMigration(db, MIGRATION); // safe to re-run
    expect(await balances(db, owner, groupId)).toEqual(before);
    expect(await count(db, friend, 'select count(*) from groups')).toBe(1); // existing members keep access
    expect(await count(db, friend, 'select count(*) from expenses')).toBe(1);
    const people = (await db.query('select id, user_id from group_people where group_id = $1', [groupId])).rows;
    expect(people.every((row) => row.id && row.user_id === null)).toBe(true);
  });

  it('rolls back without deleting invitations or links, and re-applies cleanly', async () => {
    const {
      db, owner, friend, groupId, ids,
    } = await setup();
    await accept(db, friend, (await invite(db, owner, groupId, ids.Ben, 'friend_one')).id);
    await db.exec(ROLLBACK);
    await db.exec(ROLLBACK);
    expect(await errorAs(db, owner, (tx) => tx.query("select invite_by_username($1, $2, 'x')", [groupId, ids.Chitra])))
      .toMatch(/does not exist/);
    expect((await as(db, friend, (tx) => tx.query("update groups set name = 'Member rename' where id = $1", [groupId]))).affectedRows).toBe(1);
    expect((await db.query('select user_id from group_people where id = $1', [ids.Ben])).rows[0].user_id).toBe(friend.id);
    expect(Number((await db.query('select count(*) from group_invitations')).rows[0].count)).toBe(1);

    await runMigration(db, MIGRATION);
    expect((await as(db, friend, (tx) => tx.query("update groups set name = 'Again' where id = $1", [groupId]))).affectedRows).toBe(0);
    expect((await as(db, friend, (tx) => tx.query('select person_name from list_group_members($1) where role = $2', [groupId, 'member']))).rows)
      .toEqual([{ person_name: 'Ben' }]);
  });
});
