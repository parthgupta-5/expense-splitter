import { describe, expect, it } from 'vitest';
import { MAX_BACKUP_BYTES, parseBackupText, sanitizeBackup, sanitizeGroup, sanitizeGroups } from './backup';

// A group as v2.0 saved it (decimal amounts). Old backups and device data must keep loading.
const good = { id: 'g1', name: 'Trip', people: ['Asha', 'Ben'], expenses: [{ id: 'e1', description: 'Dinner', payer: 'Asha', amount: 100, splitDetails: { Asha: 50, Ben: 50 } }], payments: [{ payer: 'Ben', payee: 'Asha', amount: 20 }] };
// The same group as this version saves it (integer cents).
const current = { id: 'g1', name: 'Trip', people: ['Asha', 'Ben'], expenses: [{ id: 'e1', description: 'Dinner', payer: 'Asha', amountCents: 10000, splitCents: { Asha: 5000, Ben: 5000 } }], payments: [{ payer: 'Ben', payee: 'Asha', amountCents: 2000 }] };

describe('sanitizeGroup', () => {
  it('keeps a valid group and fills missing ids/dates', () => {
    const { group, skipped } = sanitizeGroup(good);
    expect(skipped).toBe(0);
    expect(group.expenses[0].amountCents).toBe(10000);
    expect(group.payments[0].id).toBeTruthy();
  });
  it('converts v2.0 decimal amounts to cents and drops the decimal fields', () => {
    const { group } = sanitizeGroup({
      ...good,
      expenses: [{
        ...good.expenses[0], amount: 100.5, splitType: 'unequal', splitDetails: { Asha: 50.25, Ben: 50.25 },
        splitValues: { Asha: 50.25, Ben: 50.25 },
      }, {
        ...good.expenses[0], id: 'e2', amount: '90', splitType: 'shares', splitDetails: { Asha: '60', Ben: 30 },
        splitValues: { Asha: 2, Ben: 1 },
      }],
    });
    expect(group.expenses[0]).toMatchObject({ amountCents: 10050, splitCents: { Asha: 5025, Ben: 5025 }, splitType: 'unequal' });
    expect(group.expenses[0]).not.toHaveProperty('amount');
    expect(group.expenses[0]).not.toHaveProperty('splitDetails');
    expect(group.expenses[0].splitValues).toBeUndefined(); // decimal custom amounts are not kept in state
    expect(group.expenses[1]).toMatchObject({ amountCents: 9000, splitCents: { Asha: 6000, Ben: 3000 }, splitValues: { Asha: 2, Ben: 1 } });
    expect(group.payments[0]).toMatchObject({ amountCents: 2000 });
    expect(group.payments[0]).not.toHaveProperty('amount');
  });
  it('keeps data saved in cents exactly as it is', () => {
    const { group, skipped } = sanitizeGroup(current);
    expect(skipped).toBe(0);
    expect(group.expenses[0]).toMatchObject({ amountCents: 10000, splitCents: { Asha: 5000, Ben: 5000 } });
    expect(group.payments[0].amountCents).toBe(2000);
  });
  it('rejects cents that are not whole, positive and storable', () => {
    const expense = (extra) => ({ ...current.expenses[0], ...extra });
    const payment = (amountCents) => ({ ...current.payments[0], amountCents });
    const { group, skipped } = sanitizeGroup({
      ...current,
      expenses: [
        expense({ amountCents: 100.5, splitCents: { Asha: 100.5 } }),
        expense({ amountCents: 0, splitCents: { Asha: 0 } }),
        expense({ amountCents: 1e14, splitCents: { Asha: 1e14 } }),
        expense({ amountCents: 100, splitCents: { Asha: 101, Ben: -1 } }),
        expense({ amountCents: '100', splitCents: { Asha: 100 } }),
      ],
      payments: [payment(0.5), payment(-100), payment('100'), payment(100)],
    });
    expect(group.expenses).toEqual([]);
    expect(group.payments.map((p) => p.amountCents)).toEqual([100]);
    expect(skipped).toBe(5 + 3);
  });
  it('does not crash when expenses is a string', () => {
    const { group, skipped } = sanitizeGroup({ ...good, expenses: 'oops' });
    expect(group.expenses).toEqual([]);
    expect(skipped).toBe(1);
  });
  it('drops malformed expenses, payments and people but keeps the good ones', () => {
    const { group, skipped } = sanitizeGroup({
      ...good,
      people: ['Asha', '', 5, 'asha', 'Ben'],
      expenses: [good.expenses[0], { payer: 'x', amount: -5, splitDetails: {} }, { payer: 'x', amount: 5, splitDetails: { A: 'NaN' } }, null],
      payments: [{ payer: 'A', payee: 'A', amount: 5 }, { payer: 'A', payee: 'B', amount: 'abc' }],
    });
    expect(group.people).toEqual(['Asha', 'Ben']);
    expect(group.expenses).toHaveLength(1);
    expect(group.payments).toHaveLength(0);
    expect(skipped).toBe(3 + 2 + 3);
  });
  it('drops an expense whose shares do not add up to the amount, and keeps one that adds up in cents', () => {
    const shares = (details, amount = 100) => ({ ...good.expenses[0], id: 'x' + amount + Object.keys(details).join(), amount, splitDetails: details });
    const { group, skipped } = sanitizeGroup({
      ...good,
      expenses: [
        shares({ Asha: 50, Ben: 49.99 }), // one cent short
        shares({ Asha: 60, Ben: 50 }), // too much
        shares({}), // no shares at all
        shares({ Asha: 33.33, Ben: 33.33, Chitra: 33.34 }), // exact in cents despite float noise
        shares({ Asha: 0.1, Ben: 0.2 }, 0.3),
      ],
    });
    expect(group.expenses.map((e) => e.amountCents)).toEqual([10000, 30]);
    expect(skipped).toBe(3);
  });
  it('rejects groups without a string id or name', () => {
    expect(sanitizeGroup({ id: 1, name: 'x' }).group).toBeNull();
    expect(sanitizeGroup({ id: 'a', name: '  ' }).group).toBeNull();
    expect(sanitizeGroup('nope').group).toBeNull();
  });
  it('truncates over-long text', () => {
    expect(sanitizeGroup({ ...good, name: 'x'.repeat(200) }).group.name).toHaveLength(80);
  });
});

describe('sanitizeGroups / sanitizeBackup', () => {
  it('drops duplicate ids and non-arrays', () => {
    expect(sanitizeGroups([good, good]).groups).toHaveLength(1);
    expect(sanitizeGroups('x').groups).toEqual([]);
  });
  it('rejects non-backup shapes with a friendly error', () => {
    expect(() => sanitizeBackup({})).toThrow(/valid Expense Splitter backup/);
    expect(() => sanitizeBackup({ groups: [{ bad: true }] })).toThrow(/No usable groups/);
  });
  it('sanitises saved people and ignores bad preferences', () => {
    const r = sanitizeBackup({ groups: [good], savedPeople: ['A', 'A', 3], preferences: 'x' });
    expect(r.savedPeople).toEqual(['A']);
    expect(r.preferences).toEqual({});
  });
});

describe('parseBackupText', () => {
  it('rejects invalid JSON and oversized files', () => {
    expect(() => parseBackupText('{nope')).toThrow(/not valid JSON/);
    expect(() => parseBackupText('{}', MAX_BACKUP_BYTES + 1)).toThrow(/too large/);
  });
  it('imports a backup saved by this version (cents) and one saved by v2.0 (decimals) the same way', () => {
    const fromCents = parseBackupText(JSON.stringify({ groups: [current] })).groups[0];
    const fromDecimals = parseBackupText(JSON.stringify({ groups: [good] })).groups[0];
    expect(fromCents.expenses[0].amountCents).toBe(fromDecimals.expenses[0].amountCents);
    expect(fromCents.expenses[0].splitCents).toEqual(fromDecimals.expenses[0].splitCents);
    expect(fromCents.payments[0].amountCents).toBe(fromDecimals.payments[0].amountCents);
  });
  it('reports skipped items for an import with "expenses": "oops"', () => {
    const r = parseBackupText(JSON.stringify({ groups: [{ ...good, expenses: 'oops' }] }));
    expect(r.skipped).toBe(1);
    expect(r.groups[0].expenses).toEqual([]);
  });
});
