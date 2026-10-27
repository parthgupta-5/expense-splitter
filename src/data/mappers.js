// Converts between the app's objects (amounts in currency units, camelCase) and database rows
// (integer cents, snake_case). Pure functions, so the conversions are unit-tested.
import { DEFAULT_CURRENCY, isCurrency } from '../lib/currency';
import { fromCents, toCents } from '../lib/splits';

const byNewest = (field) => (a, b) => new Date(b[field] || 0) - new Date(a[field] || 0);
const mapValues = (object, fn) => Object.fromEntries(Object.entries(object || {}).map(([k, v]) => [k, fn(v)]));

export const rowToExpense = (row) => ({
  id: row.id,
  description: row.description,
  amount: fromCents(Number(row.amount_cents)),
  payer: row.payer,
  category: row.category || 'Other',
  splitType: row.split_type || 'equal',
  splitDetails: mapValues(row.split_details, (cents) => fromCents(Number(cents))),
  participants: Array.isArray(row.participants) && row.participants.length
    ? row.participants : Object.keys(row.split_details || {}),
  splitValues: row.split_values || undefined,
  note: row.note || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
});

export const expenseToRow = (expense, groupId) => ({
  id: expense.id,
  group_id: groupId,
  description: String(expense.description || '').trim(),
  amount_cents: toCents(expense.amount),
  payer: expense.payer,
  category: expense.category || 'Other',
  split_type: expense.splitType || 'equal',
  split_details: mapValues(expense.splitDetails, toCents),
  participants: expense.participants || Object.keys(expense.splitDetails || {}),
  split_values: expense.splitType && expense.splitType !== 'equal' && expense.splitValues ? expense.splitValues : null,
  note: expense.note || '',
});

export const rowToPayment = (row) => ({
  id: row.id,
  payer: row.payer,
  payee: row.payee,
  amount: fromCents(Number(row.amount_cents)),
  createdAt: row.created_at,
  createdBy: row.created_by,
});

export const paymentToRow = (payment, groupId) => ({
  id: payment.id,
  group_id: groupId,
  payer: payment.payer,
  payee: payment.payee,
  amount_cents: toCents(payment.amount),
});

export const rowToSnapshot = (row) => ({ ...(row.data || {}), id: row.id, savedAt: row.saved_at });

export const snapshotToRow = (snapshot, groupId) => {
  const { id, savedAt, groupId: _ignored, ...data } = snapshot;
  return { id, group_id: groupId, data, saved_at: savedAt };
};

/** A group row with embedded people, expenses, payments, saved splits and members (see GROUP_SELECT). */
export function rowToGroup(row, userId) {
  const members = row.group_members || [];
  const mine = members.find((member) => member.user_id === userId);
  return {
    id: row.id,
    name: row.name,
    currencyCode: isCurrency(row.currency_code) ? row.currency_code : DEFAULT_CURRENCY,
    people: [...(row.group_people || [])]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0) || a.name.localeCompare(b.name))
      .map((person) => person.name),
    expenses: (row.expenses || []).map(rowToExpense).sort(byNewest('createdAt')),
    payments: (row.payments || []).map(rowToPayment).sort(byNewest('createdAt')),
    savedSplits: (row.saved_splits || []).map(rowToSnapshot).sort(byNewest('savedAt')),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: row.created_by,
    role: mine?.role || (row.created_by === userId ? 'owner' : 'member'),
    memberCount: Math.max(members.length, 1),
    cloud: true,
  };
}

/** Payload for the import_group() database function (a guest group moving into an account). */
export const groupToImportPayload = (group) => ({
  name: group.name,
  currency_code: group.currencyCode || DEFAULT_CURRENCY,
  people: group.people || [],
  expenses: (group.expenses || []).map((expense) => {
    const { id: _id, group_id: _groupId, ...row } = expenseToRow(expense, null);
    return { ...row, created_at: expense.createdAt };
  }),
  payments: (group.payments || []).map((payment) => ({
    payer: payment.payer, payee: payment.payee, amount_cents: toCents(payment.amount), created_at: payment.createdAt,
  })),
  saved_splits: (group.savedSplits || []).map((snapshot) => {
    const { id: _id, savedAt, groupId: _groupId, ...data } = snapshot;
    return { data, saved_at: savedAt };
  }),
});
