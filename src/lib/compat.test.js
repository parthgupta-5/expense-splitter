// @vitest-environment jsdom
// Rollback safety for the switch to integer cents. Everything called "v2.0" below runs the deployed client's own
// code (a verbatim copy in src/test/legacy-v2), so these tests show what that client really does with our data.
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as v2Backup from '../test/legacy-v2/backup';
import * as v2Splits from '../test/legacy-v2/splits';
import * as v2Storage from '../test/legacy-v2/storage';
import { initialWorkspace, workspaceReducer } from '../state/workspaceReducer';
import {
  groupToImportPayload, rowToSnapshot, snapshotToRow,
} from '../data/mappers';
import { parseBackupText, portableGroup } from './backup';
import { computeBalances, computeSettlements, computeSplit } from './splits';
import {
  MIRROR_MARK, STATE_KEY, V2_STATE_KEY, readGuestState, writeGuestState,
} from './storage';

let failingKeys;
beforeEach(() => {
  const store = new Map();
  failingKeys = new Set();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (failingKeys.has(key)) throw new Error('QuotaExceededError');
      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
});

const people = ['Asha', 'Ben'];
const at = '2026-10-01T10:00:00.000Z';

// A group exactly as the v2.0 client saves it: decimal amounts.
const v2Trip = () => ({
  id: 'trip', name: 'Goa trip', currencyCode: 'INR', people: [...people], createdAt: at, updatedAt: at,
  expenses: [{
    id: 'hotel', description: 'Hotel', amount: 100.5, payer: 'Asha', category: 'Stay', splitType: 'shares',
    splitDetails: { Asha: 67, Ben: 33.5 }, participants: [...people], splitValues: { Asha: 2, Ben: 1 }, createdAt: at,
  }],
  payments: [{ id: 'p0', payer: 'Ben', payee: 'Asha', amount: 10.25, createdAt: at }],
  savedSplits: [],
});

/** The new client opens v2.0 data, then the user adds, edits, pays and saves a split. Returns the workspace. */
function editInThisVersion() {
  v2Storage.writeGuestState({ groups: [v2Trip()], savedPeople: ['Asha'], preferences: { currency: 'INR' } });
  let state = workspaceReducer(initialWorkspace, { type: 'loadGuest', ...readGuestState() });
  const act = (action) => { state = workspaceReducer(state, { groupId: 'trip', ...action }); };
  act({
    type: 'saveExpense',
    expense: {
      id: 'taxi', description: 'Taxi', payer: 'Ben', amountCents: 1055, splitType: 'equal',
      splitCents: computeSplit('equal', 1055, people), participants: [...people], category: 'Transport', note: '', createdAt: at,
    },
  });
  const hotel = state.groups[0].expenses.find((e) => e.id === 'hotel');
  act({
    type: 'saveExpense',
    expense: { ...hotel, amountCents: 20001, splitType: 'unequal', splitCents: { Asha: 15000, Ben: 5001 }, splitValues: undefined },
  });
  act({ type: 'addPayment', payment: { id: 'p1', payer: 'Ben', payee: 'Asha', amountCents: 750, createdAt: at } });
  const group = state.groups[0];
  const settlements = computeSettlements(computeBalances(group.people, group.expenses, group.payments));
  act({
    type: 'addSnapshot',
    snapshot: {
      id: 'snap', groupName: group.name, savedAt: at, people: [...group.people], currencyCode: 'INR',
      expenses: structuredClone(group.expenses), payments: structuredClone(group.payments), settlements,
      totalCents: 20001 + 1055,
    },
  });
  writeGuestState(state);
  return state;
}

describe('device storage after a rollback to the v2.0 client', () => {
  it('the v2.0 client sees every change made in this version, with the same amounts and balances', () => {
    const state = editInThisVersion();
    const ours = state.groups[0];

    const raw = JSON.parse(localStorage.getItem(V2_STATE_KEY));
    expect(v2Backup.sanitizeGroups(raw.groups).skipped).toBe(0); // nothing is dropped by the old parser
    expect(localStorage.getItem(V2_STATE_KEY)).not.toMatch(/Cents/); // exactly the v2.0 shape

    const [old] = v2Storage.readGuestState().groups;
    const byId = Object.fromEntries(old.expenses.map((e) => [e.id, e]));
    expect(byId.taxi).toMatchObject({ amount: 10.55, splitDetails: { Asha: 5.28, Ben: 5.27 }, splitType: 'equal' });
    expect(byId.hotel).toMatchObject({ amount: 200.01, splitDetails: { Asha: 150, Ben: 50.01 }, splitType: 'unequal' });
    expect(old.payments.map((p) => p.amount).sort()).toEqual([10.25, 7.5]);

    const oldBalances = v2Splits.computeBalances(old.people, old.expenses, old.payments);
    const newBalances = computeBalances(ours.people, ours.expenses, ours.payments);
    people.forEach((name) => expect(v2Splits.toCents(oldBalances[name].balance)).toBe(newBalances[name].balanceCents));

    const [snapshot] = old.savedSplits;
    expect(snapshot.total).toBe(210.56);
    expect(snapshot.expenses.map((e) => e.amount).sort()).toEqual([10.55, 200.01]);
    expect(v2Splits.toCents(snapshot.settlements[0].amount)).toBe(computeSettlements(newBalances)[0].amountCents);
  });

  it('changes the v2.0 client saves after a rollback are opened here, instead of the older cents copy', () => {
    editInThisVersion();
    const oldState = v2Storage.readGuestState();
    oldState.groups[0].expenses.unshift({
      id: 'snacks', description: 'Snacks', amount: 12.34, payer: 'Ben', splitType: 'equal',
      splitDetails: v2Splits.computeSplit('equal', 12.34, people), participants: [...people], createdAt: at,
    });
    v2Storage.writeGuestState(oldState);
    expect(JSON.parse(localStorage.getItem(V2_STATE_KEY))[MIRROR_MARK]).toBeUndefined();

    const reopened = readGuestState();
    const snacks = reopened.groups[0].expenses.find((e) => e.id === 'snacks');
    expect(snacks).toMatchObject({ amountCents: 1234, splitCents: { Asha: 617, Ben: 617 } });
    expect(reopened.groups[0].expenses.find((e) => e.id === 'taxi').amountCents).toBe(1055); // ours survived too

    writeGuestState(reopened); // the next save here takes over again
    expect(JSON.parse(localStorage.getItem(V2_STATE_KEY))[MIRROR_MARK]).toBe(true);
    expect(readGuestState().groups[0].expenses.map((e) => e.id)).toEqual(reopened.groups[0].expenses.map((e) => e.id));
  });

  it('opens the cents copy while the v2.0 copy is this version\'s own mirror', () => {
    const state = editInThisVersion();
    expect(readGuestState().groups[0].expenses).toEqual(state.groups[0].expenses);
  });

  it('removes the v2.0 copy rather than leave it stale when it cannot be saved', () => {
    editInThisVersion();
    failingKeys.add(V2_STATE_KEY);
    const state = workspaceReducer(initialWorkspace, { type: 'loadGuest', ...readGuestState() });
    writeGuestState(workspaceReducer(state, { type: 'removePayment', groupId: 'trip', id: 'p1' }));
    expect(localStorage.getItem(V2_STATE_KEY)).toBeNull();
    expect(readGuestState().groups[0].payments.map((p) => p.id)).toEqual(['p0']);
  });

  it('ignores a damaged v2.0 copy instead of preferring it', () => {
    const state = editInThisVersion();
    localStorage.setItem(V2_STATE_KEY, '{damaged');
    expect(readGuestState().groups[0].expenses).toEqual(state.groups[0].expenses);
    expect(localStorage.getItem(STATE_KEY)).toBeTruthy();
  });
});

describe('backup files', () => {
  const exported = () => JSON.stringify({ groups: editInThisVersion().groups.map(portableGroup), savedPeople: [], preferences: {} });

  it('a backup made by this version imports into the v2.0 client with the same amounts', () => {
    const file = exported();
    const old = v2Backup.parseBackupText(file);
    expect(old.skipped).toBe(0);
    const [group] = old.groups;
    expect(group.expenses.find((e) => e.id === 'taxi')).toMatchObject({ amount: 10.55, splitDetails: { Asha: 5.28, Ben: 5.27 } });
    expect(group.savedSplits[0].total).toBe(210.56);
  });

  it('this version reads new (cents and decimals), cents-only and v2.0 decimal-only backups to the same cents', () => {
    const mixed = JSON.parse(exported());
    const centsOnly = structuredClone(mixed);
    centsOnly.groups.forEach((group) => {
      group.expenses.forEach((e) => { delete e.amount; delete e.splitDetails; });
      group.payments.forEach((p) => { delete p.amount; });
      group.savedSplits.forEach((s) => { delete s.total; s.expenses.forEach((e) => { delete e.amount; delete e.splitDetails; }); });
    });
    const decimalOnly = structuredClone(mixed);
    decimalOnly.groups.forEach((group) => {
      group.expenses.forEach((e) => { delete e.amountCents; delete e.splitCents; });
      group.payments.forEach((p) => { delete p.amountCents; });
      group.savedSplits.forEach((s) => { delete s.totalCents; s.expenses.forEach((e) => { delete e.amountCents; delete e.splitCents; }); });
    });
    const read = (backup) => parseBackupText(JSON.stringify(backup)).groups[0];
    const fromMixed = read(mixed);
    expect(read(centsOnly)).toEqual(fromMixed);
    expect(read(decimalOnly)).toEqual(fromMixed);
    expect(fromMixed.expenses.find((e) => e.id === 'taxi')).toMatchObject({ amountCents: 1055, splitCents: { Asha: 528, Ben: 527 } });
    expect(fromMixed.savedSplits[0].totalCents).toBe(21056);
  });

  it('prefers the cents fields when both are present', () => {
    const backup = JSON.parse(exported());
    const taxi = backup.groups[0].expenses.find((e) => e.id === 'taxi');
    Object.assign(taxi, { amount: 999, splitDetails: { Asha: 999 } });
    backup.groups[0].payments[0].amount = 999;
    const [group] = parseBackupText(JSON.stringify(backup)).groups;
    expect(group.expenses.find((e) => e.id === 'taxi')).toMatchObject({ amountCents: 1055, splitCents: { Asha: 528, Ben: 527 } });
    expect(group.payments[0].amountCents).toBe(backup.groups[0].payments[0].amountCents);
  });
});

describe('cloud snapshots (saved_splits.data)', () => {
  const snapshot = () => editInThisVersion().groups[0].savedSplits[0];

  it('rows written by this version keep the decimal fields the v2.0 client shows', () => {
    const row = snapshotToRow(snapshot(), 'trip');
    // v2.0's rowToSnapshot is `{ ...row.data, id, savedAt }`; its modal reads total, expense.amount and item.amount.
    const old = { ...row.data, id: row.id, savedAt: row.saved_at };
    expect(old.total).toBe(210.56);
    expect(old.expenses.map((e) => e.amount).sort()).toEqual([10.55, 200.01]);
    old.settlements.forEach((item) => expect(typeof item.amount).toBe('number'));
    expect(row.data.totalCents).toBe(21056);
  });

  it('the import payload sends the same dual-format snapshot data', () => {
    const group = editInThisVersion().groups[0];
    const [saved] = groupToImportPayload(group).saved_splits;
    expect(saved.data).toMatchObject({ total: 210.56, totalCents: 21056 });
  });

  it('this version reads new, mixed and v2.0 decimal-only snapshot rows to the same cents', () => {
    const row = snapshotToRow(snapshot(), 'trip');
    const decimalOnly = structuredClone(row);
    delete decimalOnly.data.totalCents;
    decimalOnly.data.expenses.forEach((e) => { delete e.amountCents; delete e.splitCents; });
    decimalOnly.data.settlements.forEach((s) => { delete s.amountCents; });
    const centsOnly = structuredClone(row);
    delete centsOnly.data.total;
    centsOnly.data.expenses.forEach((e) => { delete e.amount; delete e.splitDetails; });
    centsOnly.data.settlements.forEach((s) => { delete s.amount; });

    const fromMixed = rowToSnapshot(row);
    expect(rowToSnapshot(decimalOnly)).toEqual(fromMixed);
    expect(rowToSnapshot(centsOnly)).toEqual(fromMixed);
    expect(fromMixed.totalCents).toBe(21056);
    expect(fromMixed).not.toHaveProperty('total');
  });

  it('prefers the cents fields when both are present', () => {
    const row = snapshotToRow(snapshot(), 'trip');
    row.data.total = 1;
    row.data.settlements[0].amount = 1;
    const read = rowToSnapshot(row);
    expect(read.totalCents).toBe(21056);
    expect(read.settlements[0].amountCents).toBe(row.data.settlements[0].amountCents);
  });
});
