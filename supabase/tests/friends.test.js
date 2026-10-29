// Friends with requests, and the 7-day window before a deleted account is removed for good
// (2026110201_friends_and_account_recovery.sql).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, newId, runMigration,
} from './harness.js';

const MIGRATION = '2026110201_friends_and_account_recovery.sql';
const rollback = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rollbacks',
  MIGRATION.replace('.sql', '.down.sql')), 'utf8');

const rows = async (db, user, sql, params = []) => (await as(db, user, (tx) => tx.query(sql, params))).rows;
const value = async (db, user, sql, params = []) => (await rows(db, user, sql, params))[0]?.value;
const chooseName = (db, user, handle) => as(db, user, (tx) => tx.query('select set_username($1)', [handle]));
const request = (db, user, handle) => value(db, user, 'select send_friend_request($1) as value', [handle]);
const respond = (db, user, id, yes) => value(db, user, 'select respond_friend_request($1, $2) as value', [id, yes]);
const remove = (db, user, friendId) => value(db, user, 'select remove_friend($1) as value', [friendId]);
const friends = (db, user) => rows(db, user, 'select username, status, direction from list_friends()');
const schedule = (db, user) => db.query('select schedule_account_deletion($1) as value', [user.id])
  .then((result) => result.rows[0].value);

async function setup() {
  const db = await createDatabase();
  const asha = await createUser(db, 'Asha');
  const ben = await createUser(db, 'Ben');
  const cara = await createUser(db, 'Cara');
  await chooseName(db, asha, 'asha');
  await chooseName(db, ben, 'ben_k');
  await chooseName(db, cara, 'cara');
  return {
    db, asha, ben, cara,
  };
}

describe('friend requests', () => {
  it('only becomes a friendship once the other account accepts', async () => {
    const { db, asha, ben } = await setup();
    const sent = await request(db, asha, '@Ben_K');
    expect(sent).toMatchObject({ status: 'pending', username: 'ben_k', display_name: 'Ben' });
    expect(await friends(db, asha)).toEqual([{ username: 'ben_k', status: 'pending', direction: 'outgoing' }]);
    expect(await friends(db, ben)).toEqual([{ username: 'asha', status: 'pending', direction: 'incoming' }]);

    expect(await respond(db, asha, sent.friendship_id, true)).toEqual({ error: 'This friend request is no longer waiting for you' });
    expect(await respond(db, ben, sent.friendship_id, true)).toEqual({ status: 'accepted' });
    expect(await friends(db, asha)).toEqual([{ username: 'ben_k', status: 'accepted', direction: 'outgoing' }]);
    expect(await request(db, ben, 'asha')).toEqual({ error: 'You are already friends with @asha' });
  });

  it('refuses unknown names, yourself and duplicates; asking back accepts', async () => {
    const { db, asha, ben } = await setup();
    expect(await request(db, asha, 'nobody_here')).toEqual({ error: 'No account has that username' });
    expect(await request(db, asha, 'asha')).toEqual({ error: 'That is you' });
    await request(db, asha, 'ben_k');
    expect(await request(db, asha, 'ben_k')).toEqual({ error: 'You already sent @ben_k a friend request' });
    expect(await request(db, ben, 'asha')).toMatchObject({ status: 'accepted' });
  });

  it('after a decline the sender waits 7 days, and can cancel or unfriend', async () => {
    const { db, asha, ben, cara } = await setup();
    const sent = await request(db, asha, 'ben_k');
    await respond(db, ben, sent.friendship_id, false);
    expect(await friends(db, asha)).toEqual([]);
    expect((await request(db, asha, 'ben_k')).error).toMatch(/declined recently/);
    await db.query("update friendships set responded_at = now() - interval '8 days'");
    expect(await request(db, asha, 'ben_k')).toMatchObject({ status: 'pending' });

    expect(await remove(db, asha, ben.id)).toEqual({ removed: true }); // cancels the request
    expect(await friends(db, ben)).toEqual([]);
    const again = await request(db, cara, 'asha');
    await respond(db, asha, again.friendship_id, true);
    expect(await remove(db, cara, asha.id)).toEqual({ removed: true });
    expect(await friends(db, asha)).toEqual([]);
  });

  it('keeps the table itself out of reach and tells both accounts about changes', async () => {
    const { db, asha, ben } = await setup();
    expect(await errorAs(db, asha, (tx) => tx.query('select * from friendships'))).toMatch(/permission denied/);
    expect(await errorAs(db, null, (tx) => tx.query("select send_friend_request('ben_k')"))).toMatch(/permission denied/);
    await request(db, asha, 'ben_k');
    const signals = await db.query('select user_id from invitation_updates where user_id = any($1)', [[asha.id, ben.id]]);
    expect(signals.rows).toHaveLength(2);
  });
});

describe('deleting with a 7-day window', () => {
  it('disables the account at once: it cannot be found, and what waited on it is withdrawn', async () => {
    const { db, asha, ben, cara } = await setup();
    const friendship = await request(db, asha, 'ben_k');
    await respond(db, ben, friendship.friendship_id, true);
    await request(db, cara, 'asha'); // pending, to the account that leaves
    const groupId = (await value(db, asha, 'select create_group($1, $2, $3) as value', [newId(), 'Trip', 'INR'])).id;
    const invite = await value(db, asha, 'select add_person_by_username($1, $2) as value', [groupId, 'cara']);

    const result = await schedule(db, asha);
    expect(new Date(result.deletes_on) - new Date(result.deletion_requested_at)).toBe(7 * 24 * 3600 * 1000);
    expect(await friends(db, ben)).toEqual([]);
    expect(await friends(db, cara)).toEqual([]);
    expect(await request(db, ben, 'asha')).toEqual({ error: 'No account has that username' });
    const status = await db.query('select status from group_invitations where id = $1', [invite.invitation_id]);
    expect(status.rows[0].status).toBe('revoked');
    const bensGroup = (await value(db, ben, 'select create_group($1, $2, $3) as value', [newId(), 'Flat', 'INR'])).id;
    expect((await value(db, ben, 'select find_invitee($1, $2) as value', [bensGroup, 'asha'])).status).toBe('not_found');
    expect(await errorAs(db, ben, (tx) => tx.query('select add_person_by_username($1, $2)', [bensGroup, 'asha'])))
      .toMatch(/No account has that username/);
    expect(await request(db, asha, 'cara')).toEqual({ error: 'Your account is scheduled for deletion. Restore it first.' });
  });

  it('can be restored within 7 days, keeping friendships, but not after', async () => {
    const { db, asha, ben } = await setup();
    const friendship = await request(db, asha, 'ben_k');
    await respond(db, ben, friendship.friendship_id, true);
    await schedule(db, asha);
    expect(await value(db, asha, 'select restore_account() as value')).toEqual({ restored: true });
    expect(await friends(db, ben)).toEqual([{ username: 'asha', status: 'accepted', direction: 'incoming' }]);

    await schedule(db, asha);
    await db.query("update profiles set deletion_requested_at = now() - interval '7 days 1 minute' where id = $1", [asha.id]);
    expect((await value(db, asha, 'select restore_account() as value')).error).toMatch(/have passed/);
    const due = await db.query('select user_id from accounts_due_for_deletion()');
    expect(due.rows).toEqual([{ user_id: asha.id }]);
    await db.query('delete from auth.users where id = $1', [asha.id]); // what the purge function does
    expect((await db.query('select count(*)::int as n from friendships')).rows[0].n).toBe(0);
  });

  it('refuses while the account owns a shared group, and only the server can schedule or list', async () => {
    const { db, asha, ben } = await setup();
    const groupId = (await value(db, asha, 'select create_group($1, $2, $3) as value', [newId(), 'Trip', 'INR'])).id;
    const invite = await value(db, asha, 'select add_person_by_username($1, $2) as value', [groupId, 'ben_k']);
    await value(db, ben, 'select accept_invitation($1) as value', [invite.invitation_id]);
    expect(await schedule(db, asha)).toEqual({ error: 'owns_shared_groups', groups: 'Trip' });
    expect(await errorAs(db, asha, (tx) => tx.query('select schedule_account_deletion($1)', [asha.id]))).toMatch(/permission denied/);
    expect(await errorAs(db, asha, (tx) => tx.query('select * from accounts_due_for_deletion()'))).toMatch(/permission denied/);
    expect(await errorAs(db, asha, (tx) => tx.query('update profiles set deletion_requested_at = null where id = $1', [asha.id])))
      .toMatch(/permission denied/);
  });
});

describe('rollback script', () => {
  it('removes friends and restores waiting accounts, and the migration re-applies cleanly', async () => {
    const { db, asha, ben } = await setup();
    await request(db, asha, 'ben_k');
    await schedule(db, ben);
    await db.exec(rollback);
    await db.exec(rollback); // safe to re-run
    expect((await db.query("select to_regclass('public.friendships') as t")).rows[0].t).toBeNull();
    const groupId = (await value(db, asha, 'select create_group($1, $2, $3) as value', [newId(), 'Trip', 'INR'])).id;
    expect((await value(db, asha, 'select find_invitee($1, $2) as value', [groupId, 'ben_k'])).status).toBe('available');
    await runMigration(db, MIGRATION);
    expect(await request(db, asha, 'ben_k')).toMatchObject({ status: 'pending' });
  });
});
