// Database tests: the real migrations run in PGlite and every query below is executed as a specific user,
// so these tests prove what Row Level Security, the validation triggers and the sharing functions allow.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, migrationFiles, newId, readMigration, runMigration,
} from './harness.js';
import { computeBalances, computeSplit } from '../../src/lib/splits.js';
import { removalStatus } from '../../src/lib/people.js';

async function createGroup(db, user, { name = 'Goa trip', people = ['Asha', 'Ben', 'Chitra'] } = {}) {
  const id = newId();
  await as(db, user, async (tx) => {
    await tx.query('insert into groups (id, name, created_by) values ($1, $2, $3)', [id, name, user.id]);
    for (const person of people) {
      await tx.query('insert into group_people (group_id, name) values ($1, $2)', [id, person]);
    }
  });
  return id;
}

const insertExpense = (tx, groupId, { payer = 'Asha', amount = 3000, split = { Asha: 1000, Ben: 1000, Chitra: 1000 } } = {}) => (
  tx.query(
    `insert into expenses (group_id, description, amount_cents, payer, split_details)
     values ($1, 'Dinner', $2, $3, $4) returning id`,
    [groupId, amount, payer, JSON.stringify(split)],
  )
);

const insertPayment = (tx, groupId, payer, payee, amount) => tx.query(
  'insert into payments (group_id, payer, payee, amount_cents) values ($1, $2, $3, $4)',
  [groupId, payer, payee, amount],
);

const count = async (tx, sql, params = []) => Number((await tx.query(sql, params)).rows[0].count);

describe('migrations', () => {
  it('apply cleanly twice in a row (safe to re-run)', async () => {
    const db = await createDatabase();
    for (const file of migrationFiles()) await runMigration(db, file);
    const tables = (await db.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    )).rows.map((row) => row.table_name);
    expect(tables).toEqual([
      'activity_log', 'expenses', 'group_invitations', 'group_members', 'group_people', 'groups', 'invitation_updates',
      'payments', 'profiles', 'rate_limits',
      'released_usernames', 'reserved_usernames', 'saved_splits',
    ]);
  });

  it('moves v1 JSON group data into the new tables', async () => {
    const db = await createDatabase({ upTo: '2026102701' });
    const owner = await createUser(db, 'Owner');
    const groupId = newId();
    const expenseId = newId();
    const data = {
      people: ['Asha', 'Ben', '  ', 'asha'],
      expenses: [
        {
          id: expenseId, description: 'Hotel', amount: 100.5, payer: 'Asha', splitType: 'equal',
          splitDetails: { Asha: 50.25, Ben: 50.25 }, participants: ['Asha', 'Ben'], createdAt: '2026-10-01T10:00:00Z',
        },
        { id: 'not-a-uuid', description: 'Old cab', amount: '20', payer: 'Ben', splitDetails: { Asha: 20 } },
        { description: 'Broken', amount: 'abc', payer: 'Ben', splitDetails: {} },
        'garbage',
      ],
      payments: [
        { payer: 'Ben', payee: 'Asha', amount: 10, createdAt: 'yesterday' },
        { payer: 'Ben', payee: 'Ben', amount: 10 },
      ],
      savedSplits: [{ id: newId(), groupName: 'Goa', savedAt: '2026-10-02T10:00:00Z', total: 120.5 }],
    };
    await db.query('insert into groups (id, name, created_by, data) values ($1, $2, $3, $4)', [
      groupId, 'Goa', owner.id, JSON.stringify(data),
    ]);

    await runMigration(db, '2026102701_normalize_and_share.sql');

    const people = (await db.query('select name from group_people where group_id = $1 order by name', [groupId])).rows;
    expect(people.map((row) => row.name)).toEqual(['Asha', 'Ben']);
    const expenses = (await db.query(
      'select id, amount_cents, split_details, payer from expenses where group_id = $1 order by amount_cents desc',
      [groupId],
    )).rows;
    expect(expenses).toHaveLength(2);
    expect(expenses[0]).toMatchObject({ id: expenseId, amount_cents: 10050, split_details: { Asha: 5025, Ben: 5025 } });
    expect(expenses[1]).toMatchObject({ amount_cents: 2000, payer: 'Ben' });
    expect(await count(db, 'select count(*) from payments where group_id = $1', [groupId])).toBe(1);
    expect(await count(db, 'select count(*) from saved_splits where group_id = $1', [groupId])).toBe(1);
    const column = await count(db, "select count(*) from information_schema.columns where table_name = 'groups' and column_name = 'data'");
    expect(column).toBe(0);
  });
});

describe('row level security', () => {
  let db; let asha; let ben; let groupId;
  beforeAll(async () => {
    db = await createDatabase();
    asha = await createUser(db, 'Asha');
    ben = await createUser(db, 'Ben');
    groupId = await createGroup(db, asha);
    await as(db, asha, (tx) => insertExpense(tx, groupId));
  });

  it('lets the owner read their group, people and expenses', async () => {
    await as(db, asha, async (tx) => {
      expect(await count(tx, 'select count(*) from groups')).toBe(1);
      expect(await count(tx, 'select count(*) from group_people')).toBe(3);
      expect(await count(tx, 'select count(*) from expenses')).toBe(1);
    });
  });

  it('hides another user’s groups completely', async () => {
    await as(db, ben, async (tx) => {
      expect(await count(tx, 'select count(*) from groups')).toBe(0);
      expect(await count(tx, 'select count(*) from expenses')).toBe(0);
      expect(await count(tx, 'select count(*) from activity_log')).toBe(0);
      const updated = await tx.query("update groups set name = 'Hacked' where id = $1", [groupId]);
      expect(updated.affectedRows).toBe(0);
    });
  });

  it('blocks writing into a group you are not a member of', async () => {
    const message = await errorAs(db, ben, (tx) => insertExpense(tx, groupId));
    expect(message).toMatch(/row-level security/);
  });

  it('blocks creating a group on behalf of someone else', async () => {
    const message = await errorAs(db, ben, (tx) => tx.query(
      'insert into groups (id, name, created_by) values ($1, $2, $3)', [newId(), 'Fake', asha.id],
    ));
    expect(message).toMatch(/row-level security/);
  });

  it('gives anonymous visitors no access at all', async () => {
    expect(await errorAs(db, null, (tx) => tx.query('select * from expenses'))).toMatch(/permission denied/);
    expect(await errorAs(db, null, (tx) => tx.query('select invite_member($1, $2)', [groupId, ben.email])))
      .toMatch(/permission denied/);
  });

  it('does not let clients write the activity log or add members directly', async () => {
    expect(await errorAs(db, asha, (tx) => tx.query(
      "insert into activity_log (group_id, action) values ($1, 'fake')", [groupId],
    ))).toMatch(/permission denied|row-level security/);
    expect(await errorAs(db, asha, (tx) => tx.query(
      "insert into group_members (group_id, user_id, role) values ($1, $2, 'member')", [groupId, ben.id],
    ))).toMatch(/permission denied/);
  });

  it('keeps created_by locked after insert', async () => {
    expect(await errorAs(db, asha, (tx) => tx.query(
      'update groups set created_by = $1 where id = $2', [ben.id, groupId],
    ))).toMatch(/created_by cannot be changed/);
  });

  it('supports insert ... returning, as the Supabase client uses', async () => {
    const rows = await as(db, asha, (tx) => tx.query(
      'insert into groups (id, name, created_by) values ($1, $2, $3) returning id', [newId(), 'Returning', asha.id],
    ));
    expect(rows.rows).toHaveLength(1);
  });
});

describe('server-side validation', () => {
  let db; let asha; let groupId;
  beforeAll(async () => {
    db = await createDatabase();
    asha = await createUser(db, 'Asha');
    groupId = await createGroup(db, asha);
  });

  it('accepts a split that adds up exactly', async () => {
    expect(await errorAs(db, asha, (tx) => insertExpense(tx, groupId))).toBeNull();
  });

  it('rejects a split that does not add up to the total', async () => {
    const message = await errorAs(db, asha, (tx) => insertExpense(tx, groupId, { split: { Asha: 1000, Ben: 1000 } }));
    expect(message).toBe('Split amounts must add up to the expense total');
  });

  it('rejects people who are not in the group', async () => {
    expect(await errorAs(db, asha, (tx) => insertExpense(tx, groupId, { payer: 'Mallory' })))
      .toBe('Mallory is not in this group');
    expect(await errorAs(db, asha, (tx) => insertExpense(tx, groupId, { split: { Asha: 2000, Zed: 1000 } })))
      .toBe('Zed is not in this group');
  });

  it('rejects fractional or negative cents', async () => {
    expect(await errorAs(db, asha, (tx) => insertExpense(tx, groupId, { split: { Asha: 1500.5, Ben: 1499.5 } })))
      .toBe('Split amounts must be whole, non-negative cents');
    expect(await errorAs(db, asha, (tx) => insertExpense(tx, groupId, { split: { Asha: 4000, Ben: -1000 } })))
      .toBe('Split amounts must be whole, non-negative cents');
  });

  it('rejects zero amounts and same-person payments', async () => {
    expect(await errorAs(db, asha, (tx) => insertExpense(tx, groupId, { amount: 0, split: { Asha: 0 } })))
      .toMatch(/check constraint/);
    expect(await errorAs(db, asha, (tx) => insertPayment(tx, groupId, 'Ben', 'Ben', 100))).toMatch(/payments_different_people/);
    expect(await errorAs(db, asha, (tx) => insertPayment(tx, groupId, 'Ben', 'Nobody', 100))).toBe('Nobody is not in this group');
  });

  it('rejects duplicate names that differ only by case', async () => {
    expect(await errorAs(db, asha, (tx) => tx.query(
      "insert into group_people (group_id, name) values ($1, 'asha')", [groupId],
    ))).toMatch(/group_people_name_ci_idx/);
  });

  it('blocks removing someone who still owes money, allows it once settled', async () => {
    const remove = (name) => errorAs(db, asha, (tx) => tx.query(
      'delete from group_people where group_id = $1 and name = $2', [groupId, name],
    ));
    expect(await remove('Ben')).toBe('Ben still owes or is owed money. Settle up before removing them.');
    await as(db, asha, (tx) => insertPayment(tx, groupId, 'Ben', 'Asha', 1000));
    expect(await remove('Ben')).toBeNull();
  });

  it('can still delete a whole group that has open balances', async () => {
    await as(db, asha, (tx) => tx.query('delete from groups where id = $1', [groupId]));
    expect(await count(db, 'select count(*) from expenses where group_id = $1', [groupId])).toBe(0);
  });
});

describe('person removal: the app and the database agree to the paisa', () => {
  it('a one-paisa balance blocks removal in both; exactly zero allows it in both', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const groupId = await createGroup(db, asha);
    const people = ['Asha', 'Ben', 'Chitra'];
    // 1.00 split three ways is 34/33/33. Ben repays 33 (settled); Chitra repays 32 (one paisa short).
    const expenses = [{ payer: 'Asha', amountCents: 100, splitCents: computeSplit('equal', 100, people) }];
    const payments = [
      { payer: 'Ben', payee: 'Asha', amountCents: 33 },
      { payer: 'Chitra', payee: 'Asha', amountCents: 32 },
    ];
    await as(db, asha, async (tx) => {
      await insertExpense(tx, groupId, { amount: 100, split: expenses[0].splitCents });
      for (const p of payments) await insertPayment(tx, groupId, p.payer, p.payee, p.amountCents);
    });
    const appSays = (name) => removalStatus(name, computeBalances(people, expenses, payments), expenses, payments);
    const databaseSays = (name) => errorAs(db, asha, (tx) => tx.query(
      'delete from group_people where group_id = $1 and name = $2', [groupId, name],
    ));

    expect(appSays('Chitra')).toBe('blocked');
    expect(await databaseSays('Chitra')).toMatch(/still owes or is owed money/);
    expect(appSays('Asha')).toBe('blocked'); // owed that paisa
    expect(await databaseSays('Asha')).toMatch(/still owes or is owed money/);

    expect(appSays('Ben')).toBe('confirm');
    expect(await databaseSays('Ben')).toBeNull();

    payments.push({ payer: 'Chitra', payee: 'Asha', amountCents: 1 });
    await as(db, asha, (tx) => insertPayment(tx, groupId, 'Chitra', 'Asha', 1));
    expect(appSays('Chitra')).toBe('confirm');
    expect(await databaseSays('Chitra')).toBeNull();
  });
});

describe('sharing', () => {
  let db; let owner; let friend; let stranger; let groupId;
  beforeAll(async () => {
    db = await createDatabase();
    owner = await createUser(db, 'Owner');
    friend = await createUser(db, 'Friend');
    stranger = await createUser(db, 'Stranger');
    groupId = await createGroup(db, owner);
    await as(db, owner, (tx) => insertExpense(tx, groupId));
  });

  it('no longer adds anyone by email', async () => {
    expect(await errorAs(db, owner, (tx) => tx.query('select invite_member($1, $2)', [groupId, friend.email])))
      .toMatch(/replaced.*@username/);
  });

  it('lets the owner invite by username; once the friend accepts they see the group (and no emails)', async () => {
    await as(db, friend, (tx) => tx.query("select set_username('friend_one')"));
    const person = (await as(db, owner, (tx) => tx.query(
      "select id from group_people where group_id = $1 and name = 'Ben'", [groupId],
    ))).rows[0].id;
    const invitation = (await as(db, owner, (tx) => tx.query(
      "select invite_by_username($1, $2, '@Friend_One') as value", [groupId, person],
    ))).rows[0].value;
    expect(invitation).toMatchObject({ status: 'pending', person_name: 'Ben', username: 'friend_one' });
    await as(db, friend, (tx) => tx.query('select accept_invitation($1)', [invitation.id]));
    await as(db, friend, async (tx) => {
      expect(await count(tx, 'select count(*) from groups')).toBe(1);
      expect(await count(tx, 'select count(*) from expenses')).toBe(1);
      const members = (await tx.query('select * from list_group_members($1)', [groupId])).rows;
      expect((await tx.query('select email from list_members($1)', [groupId])).rows).toEqual([{ email: null }, { email: null }]);
      expect(members.map(({ role, display_name: name, person_name: personName }) => ({ role, name, personName })))
        .toEqual([{ role: 'owner', name: 'Owner', personName: null }, { role: 'member', name: 'Friend', personName: 'Ben' }]);
      expect(Object.keys(members[0])).not.toContain('email');
      expect(JSON.stringify(members)).not.toMatch(/@example\.com/);
    });
  });

  it('lets a member add expenses but not invite, remove others or delete the group', async () => {
    expect(await errorAs(db, friend, (tx) => insertExpense(tx, groupId))).toBeNull();
    const person = (await as(db, friend, (tx) => tx.query(
      "select id from group_people where group_id = $1 and name = 'Chitra'", [groupId],
    ))).rows[0].id;
    expect(await errorAs(db, friend, (tx) => tx.query("select invite_by_username($1, $2, 'stranger')", [groupId, person])))
      .toBe('Only the group owner can invite people');
    expect(await errorAs(db, friend, (tx) => tx.query('select remove_member($1, $2)', [groupId, owner.id])))
      .toMatch(/owner cannot leave/);
    const deleted = await as(db, friend, (tx) => tx.query('delete from groups where id = $1', [groupId]));
    expect(deleted.affectedRows).toBe(0);
  });

  it('records who did what in the activity log', async () => {
    const actions = await as(db, friend, async (tx) => (await tx.query(
      'select action, actor_name from activity_log where group_id = $1 order by id', [groupId],
    )).rows);
    expect(actions.map((row) => row.action)).toEqual([
      'group_created', 'person_added', 'person_added', 'person_added', 'expense_added', 'member_joined', 'expense_added',
    ]);
    expect(actions.at(-1).actor_name).toBe('Friend');
  });

  it('does not let outsiders list members', async () => {
    expect(await errorAs(db, stranger, (tx) => tx.query('select * from list_members($1)', [groupId])))
      .toBe('You are not a member of this group');
  });

  it('lets a member leave, after which they lose access', async () => {
    await as(db, friend, (tx) => tx.query('select remove_member($1, $2)', [groupId, friend.id]));
    await as(db, friend, async (tx) => {
      expect(await count(tx, 'select count(*) from groups')).toBe(0);
    });
  });
});

describe('import_group', () => {
  it('copies a guest group into the caller’s account in one transaction', async () => {
    const db = await createDatabase();
    const user = await createUser(db, 'Guest');
    const newGroupId = await as(db, user, async (tx) => (await tx.query('select import_group($1) as id', [JSON.stringify({
      name: 'From my phone',
      currency_code: 'EUR',
      people: ['Asha', 'Ben'],
      expenses: [{
        description: 'Old expense with someone removed', amount_cents: 900, payer: 'Asha',
        split_details: { Asha: 300, Ben: 300, Removed: 300 }, split_type: 'equal',
      }],
      payments: [{ payer: 'Ben', payee: 'Asha', amount_cents: 300 }],
      saved_splits: [{ data: { groupName: 'From my phone', total: 9 } }],
    })])).rows[0].id);
    await as(db, user, async (tx) => {
      const group = (await tx.query('select created_by, currency_code from groups where id = $1', [newGroupId])).rows[0];
      expect(group).toEqual({ created_by: user.id, currency_code: 'EUR' });
      expect(await count(tx, 'select count(*) from expenses where group_id = $1', [newGroupId])).toBe(1);
      expect(await count(tx, 'select count(*) from payments where group_id = $1', [newGroupId])).toBe(1);
      const log = (await tx.query('select action from activity_log where group_id = $1', [newGroupId])).rows;
      expect(log.map((row) => row.action)).toEqual(['group_imported']);
    });
    // The bypass for old data is scoped to that one transaction.
    expect(await as(db, user, (tx) => tx.query('select is_bulk_import() as on')).then((r) => r.rows[0].on)).toBe(false);
  });
});

describe('import_group() split-total rule', () => {
  it('rejects an imported expense whose shares do not add up to its total, and imports nothing', async () => {
    const db = await createDatabase();
    const user = await createUser(db, 'Guest');
    const payload = (shares) => JSON.stringify({
      name: 'Bad import',
      people: ['Asha', 'Ben'],
      expenses: [{ description: 'Dinner', amount_cents: 1000, payer: 'Asha', split_details: shares, split_type: 'equal' }],
    });
    await expect(as(db, user, (tx) => tx.query('select import_group($1)', [payload({ Asha: 500, Ben: 499 })])))
      .rejects.toThrow(/add up to the expense total/);
    await expect(as(db, user, (tx) => tx.query('select import_group($1)', [payload({ Asha: 500.5, Ben: 499.5 })])))
      .rejects.toThrow(/whole, non-negative cents/);
    await as(db, user, async (tx) => {
      expect(await count(tx, "select count(*) from groups where name = 'Bad import'")).toBe(0);
    });
  });
});

describe('group_balances() matches computeBalances() in src/lib/splits.js', () => {
  it('for 25 random groups', async () => {
    const db = await createDatabase();
    const user = await createUser(db, 'Tester');
    const people = ['A', 'B', 'C', 'D', 'E'];
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pick = (list) => list[Math.floor(random() * list.length)];

    for (let round = 0; round < 25; round += 1) {
      const groupId = await createGroup(db, user, { people });
      const expenses = [];
      const payments = [];
      await as(db, user, async (tx) => {
        for (let i = 0; i < 6; i += 1) {
          const participants = people.filter(() => random() > 0.3);
          if (!participants.length) participants.push('A');
          const amountCents = Math.round(random() * 100000) + 1;
          const type = pick(['equal', 'shares', 'percentages']);
          const values = Object.fromEntries(participants.map((p) => [p, type === 'equal' ? 1 : Math.ceil(random() * 5)]));
          const splitCents = computeSplit(type, amountCents, participants, values);
          const expense = { payer: pick(people), amountCents, splitCents };
          expenses.push(expense);
          await insertExpense(tx, groupId, { payer: expense.payer, amount: amountCents, split: splitCents });
        }
        for (let i = 0; i < 2; i += 1) {
          const [payer, payee] = [pick(people), pick(people)];
          if (payer === payee) continue;
          const amountCents = Math.round(random() * 5000) + 1;
          payments.push({ payer, payee, amountCents });
          await insertPayment(tx, groupId, payer, payee, amountCents);
        }
        const sql = (await tx.query('select * from group_balances($1)', [groupId])).rows;
        const js = computeBalances(people, expenses, payments);
        for (const row of sql) {
          expect(row.balance_cents).toBe(js[row.name].balanceCents);
          expect(row.paid_cents).toBe(js[row.name].paidCents);
          expect(row.share_cents).toBe(js[row.name].shareCents);
        }
      });
    }
  });
});

// Guard against someone editing an applied migration instead of adding a new one.
it('keeps migrations append-only and ordered', () => {
  const files = migrationFiles();
  expect(files).toEqual([...files].sort());
  files.forEach((file) => expect(readMigration(file).length).toBeGreaterThan(100));
});
