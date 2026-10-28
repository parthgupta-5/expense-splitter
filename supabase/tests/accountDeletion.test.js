// Account deletion in the database: the 2026110101 migration's blocker list and the trigger that runs when an auth user
// is deleted. In Supabase only the delete-account Edge Function (or the Dashboard) deletes auth users; here the database
// owner does it, which is what those do. Signed-in users and visitors are shown to have no way to do it themselves.
import { describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, newId,
} from './harness.js';

const rows = async (db, user, sql, params = []) => (await as(db, user, (tx) => tx.query(sql, params))).rows;
const value = async (db, user, sql, params = []) => (await rows(db, user, sql, params))[0]?.value;
const total = async (db, sql, params = []) => Number((await db.query(sql, params)).rows[0].count);
const chooseName = (db, user, handle) => as(db, user, (tx) => tx.query('select set_username($1)', [handle]));
const createGroup = async (db, user, name) => (await value(
  db, user, 'select create_group($1, $2, $3) as value', [newId(), name, 'INR'],
)).id;
const addByUsername = (db, user, groupId, handle) => value(
  db, user, 'select add_person_by_username($1, $2) as value', [groupId, handle],
);
const accept = (db, user, id) => value(db, user, 'select accept_invitation($1) as value', [id]);
const deleteAccount = (db, user) => db.query('delete from auth.users where id = $1', [user.id]);
const blockers = (db, user) => rows(db, user, 'select group_name, member_count from account_deletion_blockers()');

async function setup() {
  const db = await createDatabase();
  const leaving = await createUser(db, 'Leaving Lee');
  const friend = await createUser(db, 'Friend');
  await chooseName(db, leaving, 'leaving_lee');
  await chooseName(db, friend, 'friend_one');
  // The friend's group, which Lee joined and spent money in.
  const shared = await createGroup(db, friend, 'Flat');
  const invite = await addByUsername(db, friend, shared, 'leaving_lee');
  await accept(db, leaving, invite.invitation_id);
  await as(db, leaving, async (tx) => {
    await tx.query(`insert into expenses (group_id, description, amount_cents, payer, split_details)
      values ($1, 'Groceries', 2000, 'Leaving Lee', '{"Leaving Lee": 1000, "Friend": 1000}')`, [shared]);
    await tx.query("insert into payments (group_id, payer, payee, amount_cents) values ($1, 'Friend', 'Leaving Lee', 400)", [shared]);
    await tx.query("insert into saved_splits (group_id, data) values ($1, '{\"total\": 20}')", [shared]);
  });
  // Lee's own group that nobody else uses, with a pending invitation to the friend.
  const solo = await createGroup(db, leaving, 'Just me');
  await addByUsername(db, leaving, solo, 'friend_one');
  return {
    db, leaving, friend, shared, solo,
  };
}

describe('what blocks a deletion', () => {
  it('lists only the caller\'s own groups that other members use', async () => {
    const { db, leaving, friend, solo } = await setup();
    expect(await blockers(db, leaving)).toEqual([]); // the pending invitation does not make "Just me" shared
    expect(await blockers(db, friend)).toEqual([{ group_name: 'Flat', member_count: 2 }]);
    expect(solo).toBeTruthy();
    expect(await errorAs(db, null, (tx) => tx.query('select * from account_deletion_blockers()'))).toMatch(/permission denied/);
  });

  it('refuses to delete an account that owns a shared group, and changes nothing', async () => {
    const { db, friend, shared } = await setup();
    await expect(deleteAccount(db, friend)).rejects.toThrow(/owns groups that other members use \(Flat\)/);
    expect(await total(db, 'select count(*) from auth.users where id = $1', [friend.id])).toBe(1);
    expect(await total(db, 'select count(*) from profiles where id = $1', [friend.id])).toBe(1);
    expect(await total(db, 'select count(*) from expenses where group_id = $1', [shared])).toBe(1);
    expect(await total(db, 'select count(*) from group_members where group_id = $1', [shared])).toBe(2);
  });

  it('allows it once the owner has deleted that group themselves', async () => {
    const { db, friend, shared } = await setup();
    await as(db, friend, (tx) => tx.query('delete from groups where id = $1', [shared]));
    await deleteAccount(db, friend);
    expect(await total(db, 'select count(*) from profiles where id = $1', [friend.id])).toBe(0);
  });
});

describe('deleting an account', () => {
  it('removes the profile, its own groups, memberships, invitations and limits, and keeps shared money intact', async () => {
    const { db, leaving, friend, shared, solo } = await setup();
    const balances = () => rows(db, friend, 'select name, balance_cents from group_balances($1) order by name', [shared]);
    const before = await balances();
    await db.query("insert into rate_limits (user_id, action) values ($1, 'test')", [leaving.id]);

    await deleteAccount(db, leaving);

    for (const [sql, label] of [
      ['select count(*) from profiles where id = $1', 'profile'],
      ['select count(*) from group_members where user_id = $1', 'memberships'],
      ['select count(*) from group_people where user_id = $1', 'linked people'],
      ['select count(*) from group_invitations where invitee_id = $1 or invited_by = $1', 'invitations'],
      ['select count(*) from rate_limits where user_id = $1', 'rate limits'],
      ['select count(*) from released_usernames where user_id = $1', 'held usernames'],
      ['select count(*) from invitation_updates where user_id = $1', 'signals'],
      ['select count(*) from groups where created_by = $1', 'own groups'],
      ['select count(*) from activity_log where actor_id = $1', 'activity actor ids'],
    ]) {
      expect(await total(db, sql, [leaving.id]), label).toBe(0);
    }
    expect(await total(db, 'select count(*) from expenses where group_id = $1', [solo])).toBe(0);
    expect(await total(db, 'select count(*) from group_invitations where group_id = $1', [solo])).toBe(0);
    // The friend's group: the expense and the person stay, so the balances do not move; the person is now unlinked.
    expect(await balances()).toEqual(before);
    expect((await db.query('select name, user_id from group_people where group_id = $1 order by created_at', [shared])).rows)
      .toEqual([{ name: 'Friend', user_id: friend.id }, { name: 'Leaving Lee', user_id: null }]);
    // Rows Lee created stay, with no link to the deleted account (not a dangling id), and nothing else about them changed.
    for (const table of ['expenses', 'payments', 'saved_splits']) {
      expect((await db.query(`select created_by from ${table} where group_id = $1`, [shared])).rows, table).toEqual([{ created_by: null }]);
    }
    expect((await db.query('select description, amount_cents from expenses where group_id = $1', [shared])).rows)
      .toEqual([{ description: 'Groceries', amount_cents: 2000 }]);
    expect(await total(db, "select count(*) from activity_log where action = 'expense_updated'")).toBe(0);
  });

  it('opens no gap in the usual rules: members still cannot edit payments or change who created an expense', async () => {
    const { db, leaving, friend, shared } = await setup();
    await deleteAccount(db, leaving);
    expect((await as(db, friend, (tx) => tx.query('update payments set amount_cents = 1 where group_id = $1', [shared]))).affectedRows)
      .toBe(0); // no update policy for clients
    await expect(db.query('update payments set amount_cents = 1 where group_id = $1', [shared]))
      .rejects.toThrow('Payments cannot be edited. Delete it and record it again.'); // and the trigger still refuses
    await as(db, friend, (tx) => tx.query("update expenses set description = 'Food', created_by = $2 where group_id = $1", [shared, friend.id]));
    expect((await db.query('select description, created_by from expenses where group_id = $1', [shared])).rows)
      .toEqual([{ description: 'Food', created_by: null }]);
    expect(await as(db, friend, (tx) => tx.query('select is_account_deletion() as on')).then((r) => r.rows[0].on)).toBe(false);
  });

  it('takes the name and account id out of the shared history', async () => {
    const { db, leaving, friend, shared } = await setup();
    await deleteAccount(db, leaving);
    const log = await rows(db, friend, 'select action, actor_name, details from activity_log where group_id = $1 order by id', [shared]);
    const text = JSON.stringify(log);
    expect(text).not.toContain(leaving.id);
    expect(log.find((row) => row.action === 'member_joined')).toMatchObject({ actor_name: 'Former member', details: {} });
    expect(log.find((row) => row.action === 'expense_added')).toMatchObject({ actor_name: 'Former member' });
    expect(log.at(-1)).toMatchObject({ action: 'member_left', details: {} });
    // Names other members gave people in their own group are theirs to keep (expenses refer to them).
    expect(log.find((row) => row.action === 'expense_added').details.payer).toBe('Leaving Lee');
  });

  it('tells a friend\'s open bell that their pending invitation is gone', async () => {
    const { db, leaving, friend } = await setup();
    const before = (await db.query('select changed_at from invitation_updates where user_id = $1', [friend.id])).rows[0].changed_at;
    await deleteAccount(db, leaving);
    expect(await rows(db, friend, 'select * from list_my_invitations()')).toEqual([]);
    const after = (await db.query('select changed_at from invitation_updates where user_id = $1', [friend.id])).rows[0].changed_at;
    expect(after).not.toEqual(before);
  });

  it('cannot be done by a signed-in user or a visitor, for themselves or anyone else', async () => {
    const { db, leaving, friend } = await setup();
    for (const [user, target] of [[leaving, leaving], [leaving, friend], [null, leaving]]) {
      expect(await errorAs(db, user, (tx) => tx.query('delete from auth.users where id = $1', [target.id]))).toMatch(/permission denied/);
    }
    expect(await errorAs(db, leaving, (tx) => tx.query('select prepare_account_deletion()'))).toMatch(/permission denied|trigger/);
    expect(await total(db, 'select count(*) from profiles where id = $1', [leaving.id])).toBe(1);
  });
});
