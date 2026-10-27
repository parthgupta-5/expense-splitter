// Converts between the app's objects (camelCase) and database rows (snake_case). Money is integer cents on both
// sides. Pure functions, so the conversions are unit-tested.
import { normalizeSnapshot, portableSnapshot } from '../lib/backup';
import { DEFAULT_CURRENCY, isCurrency } from '../lib/currency';

const byNewest = (field) => (a, b) => new Date(b[field] || 0) - new Date(a[field] || 0);
const mapValues = (object, fn) => Object.fromEntries(Object.entries(object || {}).map(([k, v]) => [k, fn(v)]));
// Raw split inputs are kept only where they are weights. v2.0 also stored custom amounts here as decimals; those
// are the same as split_details, so they are not read.
const WEIGHTED_SPLITS = new Set(['shares', 'percentages']);

export const rowToExpense = (row) => ({
  id: row.id,
  description: row.description,
  amountCents: Number(row.amount_cents),
  payer: row.payer,
  category: row.category || 'Other',
  splitType: row.split_type || 'equal',
  splitCents: mapValues(row.split_details, Number),
  participants: Array.isArray(row.participants) && row.participants.length
    ? row.participants : Object.keys(row.split_details || {}),
  splitValues: WEIGHTED_SPLITS.has(row.split_type) && row.split_values ? row.split_values : undefined,
  note: row.note || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
});

export const expenseToRow = (expense, groupId) => ({
  id: expense.id,
  group_id: groupId,
  description: String(expense.description || '').trim(),
  amount_cents: expense.amountCents,
  payer: expense.payer,
  category: expense.category || 'Other',
  split_type: expense.splitType || 'equal',
  split_details: { ...expense.splitCents },
  participants: expense.participants || Object.keys(expense.splitCents || {}),
  split_values: WEIGHTED_SPLITS.has(expense.splitType) && expense.splitValues ? expense.splitValues : null,
  note: expense.note || '',
});

export const rowToPayment = (row) => ({
  id: row.id,
  payer: row.payer,
  payee: row.payee,
  amountCents: Number(row.amount_cents),
  createdAt: row.created_at,
  createdBy: row.created_by,
});

export const paymentToRow = (payment, groupId) => ({
  id: payment.id,
  group_id: groupId,
  payer: payment.payer,
  payee: payment.payee,
  amount_cents: payment.amountCents,
});

/** Cents fields are used when present; snapshots saved by v2.0 have only decimal amounts and are converted. */
export const rowToSnapshot = (row) => normalizeSnapshot({ ...(row.data || {}), id: row.id, savedAt: row.saved_at });

/** Snapshot rows keep the v2.0 decimal fields next to the cents ones, so the v2.0 client can still show them. */
export const snapshotToRow = (snapshot, groupId) => {
  const { id, savedAt, groupId: _ignored, ...data } = portableSnapshot(snapshot);
  return { id, group_id: groupId, data, saved_at: savedAt };
};

const sortPeople = (people) => [...(people || [])]
  .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0) || a.name.localeCompare(b.name));

/** A group row with embedded people, expenses, payments, saved splits and members (see GROUP_SELECT). */
export function rowToGroup(row, userId) {
  const members = row.group_members || [];
  const mine = members.find((member) => member.user_id === userId);
  return {
    id: row.id,
    name: row.name,
    currencyCode: isCurrency(row.currency_code) ? row.currency_code : DEFAULT_CURRENCY,
    people: sortPeople(row.group_people).map((person) => person.name),
    // Each person's id and linked account (cloud groups only), for invitations.
    personRecords: sortPeople(row.group_people).map((person) => ({ id: person.id, name: person.name, userId: person.user_id || null })),
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
    payer: payment.payer, payee: payment.payee, amount_cents: payment.amountCents, created_at: payment.createdAt,
  })),
  saved_splits: (group.savedSplits || []).map((snapshot) => {
    const { id: _id, savedAt, groupId: _groupId, ...data } = portableSnapshot(snapshot);
    return { data, saved_at: savedAt };
  }),
});
