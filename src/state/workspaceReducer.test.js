import { describe, expect, it } from 'vitest';
import { initialWorkspace, workspaceReducer } from './workspaceReducer';

const group = (id, extra = {}) => ({
  id, name: 'G' + id, people: ['A', 'B'], expenses: [], payments: [], savedSplits: [], updatedAt: 'old', ...extra,
});
const guest = (groups) => workspaceReducer(initialWorkspace, {
  type: 'loadGuest', groups, savedPeople: [], preferences: {},
});

describe('workspaceReducer', () => {
  it('loads guest data as ready', () => {
    expect(guest([group('1')])).toMatchObject({ mode: 'guest', status: 'ready', groups: [group('1')] });
  });

  it('ignores a cloud response that arrives after the user changed', () => {
    const loading = workspaceReducer(initialWorkspace, { type: 'cloudLoading', userId: 'u2' });
    const stale = workspaceReducer(loading, { type: 'loadCloud', userId: 'u1', groups: [group('x')] });
    expect(stale).toBe(loading);
    const fresh = workspaceReducer(loading, {
      type: 'loadCloud', userId: 'u2', groups: [group('y')], profile: { saved_people: ['Zed'], currency_code: 'EUR' },
    });
    expect(fresh).toMatchObject({ status: 'ready', savedPeople: ['Zed'], preferences: { currency: 'EUR' } });
  });

  it('adds and removes people, stamping updatedAt on that group only', () => {
    let state = guest([group('1'), group('2')]);
    state = workspaceReducer(state, { type: 'addPeople', groupId: '1', names: ['C'] });
    expect(state.groups[0].people).toEqual(['A', 'B', 'C']);
    expect(state.groups[0].updatedAt).not.toBe('old');
    expect(state.groups[1].updatedAt).toBe('old');
    state = workspaceReducer(state, { type: 'removePerson', groupId: '1', name: 'A' });
    expect(state.groups[0].people).toEqual(['B', 'C']);
  });

  it('inserts a new expense first and replaces an edited one in place', () => {
    let state = guest([group('1', { expenses: [{ id: 'a', amount: 1 }] })]);
    state = workspaceReducer(state, { type: 'saveExpense', groupId: '1', expense: { id: 'b', amount: 2 } });
    expect(state.groups[0].expenses.map((e) => e.id)).toEqual(['b', 'a']);
    state = workspaceReducer(state, { type: 'saveExpense', groupId: '1', expense: { id: 'a', amount: 5 } });
    expect(state.groups[0].expenses).toEqual([{ id: 'b', amount: 2 }, { id: 'a', amount: 5 }]);
    state = workspaceReducer(state, { type: 'removeExpense', groupId: '1', id: 'b' });
    expect(state.groups[0].expenses).toEqual([{ id: 'a', amount: 5 }]);
  });

  it('handles payments, snapshots, renames and removals', () => {
    let state = guest([group('1')]);
    state = workspaceReducer(state, { type: 'addPayment', groupId: '1', payment: { id: 'p' } });
    state = workspaceReducer(state, { type: 'addSnapshot', groupId: '1', snapshot: { id: 's' } });
    state = workspaceReducer(state, { type: 'renameGroup', groupId: '1', name: 'Goa', currencyCode: 'USD' });
    expect(state.groups[0]).toMatchObject({ name: 'Goa', currencyCode: 'USD', payments: [{ id: 'p' }], savedSplits: [{ id: 's' }] });
    state = workspaceReducer(state, { type: 'removePayment', groupId: '1', id: 'p' });
    state = workspaceReducer(state, { type: 'removeSnapshot', groupId: '1', id: 's' });
    expect(state.groups[0]).toMatchObject({ payments: [], savedSplits: [] });
    state = workspaceReducer(state, { type: 'removeGroup', groupId: '1' });
    expect(state.groups).toEqual([]);
  });

  it('upserts groups from live updates without duplicating them', () => {
    let state = guest([group('1')]);
    state = workspaceReducer(state, { type: 'upsertGroup', group: group('2') });
    state = workspaceReducer(state, { type: 'upsertGroup', group: group('1', { name: 'Renamed' }) });
    expect(state.groups.map((g) => g.name)).toEqual(['G2', 'Renamed']);
  });

  it('leaves state untouched for an unknown group and rejects unknown actions', () => {
    const state = guest([group('1')]);
    expect(workspaceReducer(state, { type: 'addPeople', groupId: 'nope', names: ['X'] })).toBe(state);
    expect(() => workspaceReducer(state, { type: 'bogus' })).toThrow(/Unknown workspace action/);
  });
});
