// @vitest-environment jsdom
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as repo from '../data/cloudRepo';
import { STATE_KEY, newGroup, readGuestState } from '../lib/storage';
import { useWorkspace } from './useWorkspace';

vi.mock('../data/cloudRepo', () => ({
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  createGroup: vi.fn(),
  addPeople: vi.fn(),
  saveExpense: vi.fn(),
  importGroup: vi.fn(),
  subscribeToChanges: vi.fn(),
}));

const serverGroup = () => ({
  ...newGroup('Server trip'), id: 'g1', people: ['Asha'], cloud: true, role: 'owner', memberCount: 1,
});
const notify = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() };
let realtime;

beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  repo.fetchGroups.mockResolvedValue([serverGroup()]);
  repo.fetchGroup.mockResolvedValue(serverGroup());
  repo.fetchProfile.mockResolvedValue({ saved_people: ['Asha'], currency_code: 'EUR', preferences: {} });
  repo.subscribeToChanges.mockImplementation((handlers) => { realtime = handlers; return () => {}; });
});
afterEach(() => { vi.clearAllMocks(); });

const signedIn = () => renderHook(() => useWorkspace({ user: { id: 'u1' }, authReady: true, notify }));

describe('useWorkspace (signed in)', () => {
  it('loads groups and the profile from the server', async () => {
    const { result } = signedIn();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ mode: 'cloud', savedPeople: ['Asha'], preferences: { currency: 'EUR' } });
    expect(result.current.groups[0].name).toBe('Server trip');
  });

  it('shows a change immediately and writes it to the server', async () => {
    repo.addPeople.mockResolvedValue();
    const { result } = signedIn();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let kept;
    await act(async () => { kept = await result.current.actions.addPeople('g1', ['Ben']); });
    expect(kept).toBe(true);
    expect(repo.addPeople).toHaveBeenCalledWith('g1', ['Ben']);
    expect(result.current.groups[0].people).toEqual(['Asha', 'Ben']);
  });

  it('explains a failed write and restores the server copy', async () => {
    repo.saveExpense.mockRejectedValue(new Error('Split amounts must add up to the expense total'));
    const { result } = signedIn();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let kept;
    await act(async () => {
      kept = await result.current.actions.saveExpense('g1', { id: 'e1', amountCents: 1000, payer: 'Asha', splitCents: {} });
    });
    expect(kept).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Could not save the expense: Split amounts must add up to the expense total');
    expect(repo.fetchGroup).toHaveBeenCalledWith('g1', 'u1');
    expect(result.current.groups[0].expenses).toEqual([]);
  });

  it('re-reads a group when another member changes it', async () => {
    const { result } = signedIn();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    repo.fetchGroup.mockResolvedValue({ ...serverGroup(), people: ['Asha', 'Friend'] });
    act(() => realtime.onGroupChanged('g1'));
    await waitFor(() => expect(result.current.groups[0].people).toEqual(['Asha', 'Friend']));
    act(() => realtime.onGroupDeleted('g1'));
    expect(result.current.groups).toEqual([]);
  });

  it('shares the one live channel with the activity bell: rows to listeners, and whether it is live', async () => {
    const { result, unmount } = signedIn();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.realtime).toBe('connecting');
    act(() => realtime.onStatus('live'));
    expect(result.current.realtime).toBe('live');

    const seen = [];
    let stop;
    act(() => { stop = result.current.actions.onActivity((row) => seen.push(row.id)); });
    act(() => realtime.onGroupChanged('g1', { id: 7, group_id: 'g1' }));
    act(() => realtime.onStatus('offline'));
    expect(result.current.realtime).toBe('offline');
    act(() => stop());
    act(() => realtime.onGroupChanged('g1', { id: 8, group_id: 'g1' }));
    expect(seen).toEqual([7]);
    expect(repo.subscribeToChanges).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('never writes account data to this device', async () => {
    const { result } = signedIn();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('offers device groups for import and removes them from the device once moved', async () => {
    const local = { ...newGroup('Made offline'), people: ['Zed'] };
    localStorage.setItem(STATE_KEY, JSON.stringify({ groups: [local] }));
    repo.importGroup.mockResolvedValue('new-id');
    const { result } = signedIn();
    await waitFor(() => expect(result.current.guestToImport.map((g) => g.name)).toEqual(['Made offline']));
    await act(async () => { await result.current.actions.importGuestGroups(result.current.guestToImport); });
    expect(repo.importGroup).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(result.current.guestToImport).toEqual([]);
  });
});

describe('useWorkspace (guest)', () => {
  it('works entirely on this device without calling the server', async () => {
    const { result } = renderHook(() => useWorkspace({ user: null, authReady: true, notify }));
    await waitFor(() => expect(result.current.mode).toBe('guest'));
    const groupId = result.current.groups[0].id;
    await act(async () => { await result.current.actions.addPeople(groupId, ['Asha']); });
    expect(readGuestState().groups[0].people).toEqual(['Asha']);
    expect(repo.addPeople).not.toHaveBeenCalled();
    expect(repo.fetchGroups).not.toHaveBeenCalled();
    expect(repo.subscribeToChanges).not.toHaveBeenCalled();
    expect(result.current.realtime).toBe('off');
  });
});
