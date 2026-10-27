import { describe, expect, it } from 'vitest';
import {
  expenseToRow, groupToImportPayload, paymentToRow, rowToExpense, rowToGroup, rowToPayment, rowToSnapshot, snapshotToRow,
} from './mappers';

const expense = {
  id: 'e1',
  description: '  Dinner ',
  amount: 100.1,
  payer: 'Asha',
  splitType: 'shares',
  splitDetails: { Asha: 66.73, Ben: 33.37 },
  participants: ['Asha', 'Ben'],
  splitValues: { Asha: 2, Ben: 1 },
  category: 'Food & drink',
  note: 'birthday',
  createdAt: '2026-10-01T10:00:00.000Z',
};

describe('expense mapping', () => {
  it('stores money as integer cents and trims text', () => {
    const row = expenseToRow(expense, 'g1');
    expect(row).toMatchObject({
      id: 'e1', group_id: 'g1', description: 'Dinner', amount_cents: 10010,
      split_details: { Asha: 6673, Ben: 3337 }, split_type: 'shares', split_values: { Asha: 2, Ben: 1 },
    });
    expect(Number.isInteger(row.amount_cents)).toBe(true);
  });

  it('drops split values for equal splits', () => {
    expect(expenseToRow({ ...expense, splitType: 'equal' }, 'g1').split_values).toBeNull();
  });

  it('round-trips without losing a cent', () => {
    const back = rowToExpense({ ...expenseToRow(expense, 'g1'), created_at: expense.createdAt });
    expect(back.amount).toBe(100.1);
    expect(back.splitDetails).toEqual({ Asha: 66.73, Ben: 33.37 });
    expect(back.description).toBe('Dinner');
  });

  it('falls back to split names when participants are missing', () => {
    expect(rowToExpense({ amount_cents: 100, split_details: { A: 100 }, participants: [] }).participants).toEqual(['A']);
  });
});

describe('payment and snapshot mapping', () => {
  it('maps payments both ways', () => {
    const row = paymentToRow({ id: 'p', payer: 'A', payee: 'B', amount: 12.5 }, 'g');
    expect(row).toEqual({ id: 'p', group_id: 'g', payer: 'A', payee: 'B', amount_cents: 1250 });
    expect(rowToPayment({ ...row, created_at: 'x' })).toMatchObject({ amount: 12.5, createdAt: 'x' });
  });

  it('keeps snapshot data as a document', () => {
    const snapshot = { id: 's', savedAt: '2026-01-01', groupId: 'ignored', groupName: 'Trip', total: 5 };
    const row = snapshotToRow(snapshot, 'g');
    expect(row).toEqual({ id: 's', group_id: 'g', saved_at: '2026-01-01', data: { groupName: 'Trip', total: 5 } });
    expect(rowToSnapshot(row)).toEqual({ id: 's', savedAt: '2026-01-01', groupName: 'Trip', total: 5 });
  });
});

describe('rowToGroup', () => {
  const row = {
    id: 'g', name: 'Trip', currency_code: 'EUR', created_by: 'owner', created_at: 't0', updated_at: 't1',
    group_people: [{ name: 'Ben', created_at: '2026-01-02' }, { name: 'Asha', created_at: '2026-01-01' }],
    expenses: [
      { id: 'old', amount_cents: 100, split_details: {}, created_at: '2026-01-01' },
      { id: 'new', amount_cents: 100, split_details: {}, created_at: '2026-02-01' },
    ],
    payments: [],
    saved_splits: [],
    group_members: [{ user_id: 'owner', role: 'owner' }, { user_id: 'friend', role: 'member' }],
  };

  it('orders people by when they joined and expenses newest first', () => {
    const group = rowToGroup(row, 'friend');
    expect(group.people).toEqual(['Asha', 'Ben']);
    expect(group.expenses.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('works out the viewer’s role and the member count', () => {
    expect(rowToGroup(row, 'friend')).toMatchObject({ role: 'member', memberCount: 2, cloud: true, currencyCode: 'EUR' });
    expect(rowToGroup(row, 'owner').role).toBe('owner');
  });

  it('falls back to INR for an unknown currency', () => {
    expect(rowToGroup({ ...row, currency_code: 'XYZ' }, 'owner').currencyCode).toBe('INR');
  });
});

describe('groupToImportPayload', () => {
  it('sends cents and no client ids (the server makes new ones)', () => {
    const payload = groupToImportPayload({
      id: 'local', name: 'Trip', currencyCode: 'USD', people: ['Asha', 'Ben'],
      expenses: [expense],
      payments: [{ id: 'p', payer: 'Ben', payee: 'Asha', amount: 10, createdAt: 't' }],
      savedSplits: [{ id: 's', savedAt: 't', groupId: 'local', total: 1 }],
    });
    expect(payload.currency_code).toBe('USD');
    expect(payload.expenses[0]).not.toHaveProperty('id');
    expect(payload.expenses[0]).not.toHaveProperty('group_id');
    expect(payload.expenses[0]).toMatchObject({ amount_cents: 10010, created_at: expense.createdAt });
    expect(payload.payments).toEqual([{ payer: 'Ben', payee: 'Asha', amount_cents: 1000, created_at: 't' }]);
    expect(payload.saved_splits).toEqual([{ data: { total: 1 }, saved_at: 't' }]);
  });
});
