// Usernames: the 2026102901 migration run for real in PGlite. Queries run as a specific user (RLS and column
// privileges apply) or as the database owner where a test needs to set up state or move the clock back.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, newId, runMigration,
} from './harness.js';

const MIGRATION = '2026102901_profiles_usernames.sql';
const ROLLBACK = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rollbacks', '2026102901_profiles_usernames.down.sql'),
  'utf8',
);
const PROVISIONAL = /^user_[0-9a-f]{8}$/;

const value = (db, user, sql, params = []) => as(db, user, async (tx) => (await tx.query(sql, params)).rows[0]?.value);
const check = (db, user, name) => value(db, user, 'select check_username($1) as value', [name]);
const setName = (db, user, name) => value(db, user, 'select set_username($1) as value', [name]);
/** The rule message set_username() returned, or the error it raised, or null when the name was set. */
const setNameError = async (db, user, name) => {
  try {
    return (await setName(db, user, name))?.error ?? null;
  } catch (error) {
    return error.message;
  }
};
const profileOf = async (db, user) => (await db.query('select * from profiles where id = $1', [user.id])).rows[0];
const ownerUpdate = (db, sql, params) => db.transaction(async (tx) => {
  await tx.query("select set_config('app.username_change', 'on', true)");
  await tx.query(sql, params);
});
/** Moves the user's last username change back by `days` (as the database owner). */
const ageChange = (db, user, days) => ownerUpdate(
  db, "update profiles set username_changed_at = username_changed_at - make_interval(days => $2) where id = $1", [user.id, days],
);
const ageHold = (db, name, days) => db.query(
  'update released_usernames set released_at = released_at - make_interval(days => $2) where username = $1', [name, days],
);
const holdStart = async (db, name) => (
  await db.query('select released_at from released_usernames where username = $1', [name])
).rows[0]?.released_at;

describe('backfill of existing accounts', () => {
  it('gives every existing profile a unique provisional name, creates missing profiles, and is safe to re-run', async () => {
    const db = await createDatabase({ upTo: MIGRATION.slice(0, 10) });
    const users = [await createUser(db, 'Asha'), await createUser(db, 'Ben'), await createUser(db, 'Chitra')];
    const orphan = await createUser(db, 'Orphan');
    await db.query('delete from profiles where id = $1', [orphan.id]);

    await runMigration(db, MIGRATION);
    const rows = (await db.query('select id, username, username_confirmed_at from profiles order by id')).rows;
    expect(rows).toHaveLength(4);
    rows.forEach((row) => {
      expect(row.username).toMatch(PROVISIONAL);
      expect(row.username_confirmed_at).toBeNull();
    });
    expect(new Set(rows.map((row) => row.username)).size).toBe(4);
    expect(rows.map((row) => row.id)).toContain(orphan.id);

    await runMigration(db, MIGRATION);
    const again = (await db.query('select id, username from profiles order by id')).rows;
    expect(again).toEqual(rows.map(({ id, username }) => ({ id, username })));
    expect((await profileOf(db, users[0])).display_name).toBe('Asha');
  });

  it('gives new sign-ups a provisional name too', async () => {
    const db = await createDatabase();
    const user = await createUser(db, 'Newcomer');
    expect((await profileOf(db, user)).username).toMatch(PROVISIONAL);
  });
});

describe('direct writes and privacy', () => {
  it('denies any direct write to the username columns', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    for (const column of ['username', 'username_confirmed_at', 'username_changed_at', 'created_at']) {
      const message = await errorAs(db, asha, (tx) => tx.query(
        `update profiles set ${column} = ${column === 'username' ? "'asha_rao'" : 'now()'} where id = $1`, [asha.id],
      ));
      expect(message, column).toMatch(/permission denied/);
    }
    await db.query('delete from profiles where id = $1', [asha.id]);
    expect(await errorAs(db, asha, (tx) => tx.query(
      "insert into profiles (id, display_name, username) values ($1, 'Asha', 'asha_rao')", [asha.id],
    ))).toMatch(/permission denied/);
  });

  it('blocks username changes outside set_username() even for a role that could write the column', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    await expect(db.query("update profiles set username = 'asha_rao' where id = $1", [asha.id]))
      .rejects.toThrow(/Change your username from Settings/);
  });

  it('still accepts the profile saves the deployed app makes, and display name edits', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const before = (await profileOf(db, asha)).username;
    await as(db, asha, async (tx) => {
      await tx.query(
        `insert into profiles (id, saved_people, currency_code, preferences, updated_at) values ($1, $2, 'EUR', '{}', now())
         on conflict (id) do update set id = excluded.id, saved_people = excluded.saved_people,
           currency_code = excluded.currency_code, preferences = excluded.preferences, updated_at = excluded.updated_at`,
        [asha.id, ['Ben']],
      );
      await tx.query(
        `insert into profiles (id, display_name, avatar_url, updated_at) values ($1, 'Asha R', '', now())
         on conflict (id) do update set id = excluded.id, display_name = excluded.display_name,
           avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`,
        [asha.id],
      );
    });
    expect(await profileOf(db, asha)).toMatchObject({
      display_name: 'Asha R', currency_code: 'EUR', saved_people: ['Ben'], username: before,
    });
  });

  it('keeps every profile readable and writable only by its owner', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    await as(db, ben, async (tx) => {
      expect((await tx.query('select * from profiles')).rows.map((row) => row.id)).toEqual([ben.id]);
      expect((await tx.query("update profiles set display_name = 'x' where id = $1", [asha.id])).affectedRows).toBe(0);
    });
    expect(await errorAs(db, ben, (tx) => tx.query('delete from profiles where id = $1', [ben.id]))).toMatch(/permission denied/);
    expect(await errorAs(db, null, (tx) => tx.query('select * from profiles'))).toMatch(/permission denied/);
    expect(await errorAs(db, null, (tx) => tx.query("select check_username('asha')"))).toMatch(/permission denied/);
    expect(await errorAs(db, null, (tx) => tx.query("select set_username('asha')"))).toMatch(/permission denied/);
    expect(await errorAs(db, ben, (tx) => tx.query('select * from released_usernames'))).toMatch(/permission denied/);
    expect(await errorAs(db, ben, (tx) => tx.query("select throttle('x', 1, '1 minute')"))).toMatch(/permission denied/);
  });
});

describe('check_username()', () => {
  it('normalises input and reports available, yours, taken, invalid and reserved', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    expect(await check(db, asha, '  @Asha_Rao ')).toBe('available');
    await setName(db, asha, 'asha_rao');
    expect(await check(db, asha, 'asha_rao')).toBe('yours');
    expect(await check(db, ben, '@ASHA_RAO')).toBe('taken');

    for (const bad of ['ab', '1asha', '_asha', 'a'.repeat(21), 'has space', 'asha-rao', 'émile', 'аsha', 'ａsha', '']) {
      expect(await check(db, ben, bad), JSON.stringify(bad)).toBe('invalid');
    }
    for (const reserved of ['admin', 'Admin', '@support', 'user_ab12cd34', 'user_me']) {
      expect(await check(db, ben, reserved), reserved).toBe('reserved');
    }
  });
});

describe('set_username()', () => {
  it('replaces the provisional name, then enforces uniqueness regardless of case', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    const result = await setName(db, asha, '@Asha_Rao');
    expect(result).toMatchObject({ username: 'asha_rao', username_changed_at: null });
    expect(result.username_confirmed_at).toBeTruthy();
    expect(await setNameError(db, ben, 'ASHA_RAO')).toBe('That username is taken');
    expect(await setNameError(db, ben, 'admin')).toBe('That username is reserved');
    expect(await setNameError(db, ben, 'user_ab12cd34')).toBe('That username is reserved');
    expect(await setNameError(db, ben, 'b')).toMatch(/3–20 characters/);
    expect((await profileOf(db, ben)).username).toMatch(PROVISIONAL);
  });

  it('allows changing a chosen name once per 30 days', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    await setName(db, asha, 'asha_rao');
    await setName(db, asha, 'asha_r'); // the first change of a chosen name
    expect((await profileOf(db, asha)).username_changed_at).toBeTruthy();
    expect(await setNameError(db, asha, 'asha_new')).toMatch(/You can change your username again on \d{1,2} \w{3} \d{4}/);
    expect(await setName(db, asha, 'asha_r')).toMatchObject({ username: 'asha_r' }); // same name: no change
    await ageChange(db, asha, 29);
    expect(await setNameError(db, asha, 'asha_new')).toMatch(/again on/);
    await ageChange(db, asha, 2);
    expect(await setName(db, asha, 'asha_new')).toMatchObject({ username: 'asha_new' });
  });

  it('holds a released name for 30 days; only its former owner can reclaim it meanwhile', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    await setName(db, asha, 'asha_rao');
    await setName(db, asha, 'asha_r');
    const changedAt = (await profileOf(db, asha)).username_changed_at;

    expect(await check(db, ben, 'asha_rao')).toBe('taken');
    expect(await setNameError(db, ben, 'asha_rao')).toBe('That username is taken');

    // Taking it back is an undo: allowed despite the 30-day rule, and it does not restart that clock.
    expect(await setName(db, asha, 'asha_rao')).toMatchObject({ username: 'asha_rao' });
    expect((await profileOf(db, asha)).username_changed_at).toEqual(changedAt);
    expect(await setNameError(db, ben, 'asha_r')).toBe('That username is taken'); // now asha_r is held for Asha

    // Swapping back and forth never holds the other name past the original change's 30 days.
    await setName(db, asha, 'asha_r');
    expect(await holdStart(db, 'asha_rao')).toEqual(changedAt);
    await setName(db, asha, 'asha_rao');
    expect(await holdStart(db, 'asha_r')).toEqual(changedAt);
    expect((await profileOf(db, asha)).username_changed_at).toEqual(changedAt);

    await ageHold(db, 'asha_r', 31);
    expect(await check(db, ben, 'asha_r')).toBe('available');
    expect(await setName(db, ben, 'asha_r')).toMatchObject({ username: 'asha_r' });
  });

  it('never holds provisional names', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    await setName(db, asha, 'asha_rao');
    expect(Number((await db.query('select count(*) from released_usernames')).rows[0].count)).toBe(0);
  });
});

describe('rate limits', () => {
  it('limits username checks to 60 per 10 minutes per user', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    for (let i = 0; i < 60; i += 1) await check(db, asha, 'name' + i);
    const blocked = () => errorAs(db, asha, (tx) => tx.query("select check_username('another')"));
    expect(await blocked()).toMatch(/Too many attempts/);
    expect(await blocked()).toMatch(/Too many attempts/); // stays blocked
    expect(await check(db, ben, 'another')).toBe('available'); // per user
    await db.query("update rate_limits set window_start = now() - interval '11 minutes' where user_id = $1", [asha.id]);
    expect(await check(db, asha, 'another')).toBe('available');
  });

  it('limits username changes to 10 per hour per user', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    await setName(db, ben, 'ben_k');
    // Refused attempts count too, so set_username() cannot be used to probe which names exist.
    for (let i = 0; i < 5; i += 1) expect(await setNameError(db, asha, 'admin')).toBe('That username is reserved');
    for (let i = 0; i < 5; i += 1) expect(await setNameError(db, asha, 'ben_k')).toBe('That username is taken');
    expect(await setNameError(db, asha, 'asha_rao')).toMatch(/Too many attempts/);
    expect((await profileOf(db, asha)).username).toMatch(PROVISIONAL);
  });
});

describe('suggest_username()', () => {
  it('suggests an available, valid name based on the display name', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha Rao');
    const other = await createUser(db, 'Someone');
    const suggest = (user) => value(db, user, 'select suggest_username() as value');
    expect(await suggest(asha)).toBe('asharao');
    await setName(db, other, 'asharao');
    expect(await suggest(asha)).toMatch(/^asharao\d{4}$/);
    expect(await suggest(await createUser(db, 'Al'))).toMatch(/^friend(\d{4})?$/);
    expect(await suggest(await createUser(db, 'Admin'))).toMatch(/^admin\d{4}$/);
  });
});

describe('rollback script', () => {
  it('undoes the rules without touching group data, and re-applying restores the same usernames', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    await setName(db, asha, 'asha_rao');
    const groupId = newId();
    await as(db, asha, async (tx) => {
      await tx.query('insert into groups (id, name, created_by) values ($1, $2, $3)', [groupId, 'Trip', asha.id]);
      await tx.query("insert into group_people (group_id, name) values ($1, 'Asha')", [groupId]);
      await tx.query(
        `insert into expenses (group_id, description, amount_cents, payer, split_details)
         values ($1, 'Dinner', 100, 'Asha', '{"Asha": 100}')`, [groupId],
      );
    });

    await db.exec(ROLLBACK);
    await db.exec(ROLLBACK); // safe to re-run
    expect(await errorAs(db, asha, (tx) => tx.query("select set_username('x_y_z')"))).toMatch(/does not exist/);
    // With the rules gone, the username columns stay closed to clients.
    expect(await errorAs(db, asha, (tx) => tx.query("update profiles set username = 'x_y_z' where id = $1", [asha.id])))
      .toMatch(/permission denied/);
    const newcomer = await createUser(db, 'Newcomer');
    expect((await profileOf(db, newcomer)).username).toBeNull();
    await as(db, asha, (tx) => tx.query(
      "insert into profiles (id, display_name, updated_at) values ($1, 'Asha', now()) on conflict (id) do update set display_name = excluded.display_name",
      [asha.id],
    ));

    await runMigration(db, MIGRATION);
    expect((await profileOf(db, asha)).username).toBe('asha_rao');
    expect((await profileOf(db, newcomer)).username).toMatch(PROVISIONAL);
    expect(Number((await db.query('select count(*) from expenses where group_id = $1', [groupId])).rows[0].count)).toBe(1);
    expect(await setNameError(db, newcomer, 'asha_rao')).toBe('That username is taken');
  });
});
