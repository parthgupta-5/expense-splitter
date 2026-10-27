// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_SYNC_META_KEY, STATE_KEY, clearGuestState, dropLegacyCloudCopies, isNonEmptyGroup, legacyGroup, newGroup,
  readGuestState, readSaved, writeGuestState,
} from './storage';

// Node 25+ ships an incomplete global localStorage, so tests use a small in-memory stand-in.
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
});

describe('readSaved', () => {
  it('returns no groups for missing, invalid or non-object storage', () => {
    expect(readSaved().groups).toBeUndefined();
    localStorage.setItem(STATE_KEY, '{not json');
    expect(readSaved().groups).toBeUndefined();
    localStorage.setItem(STATE_KEY, '[1,2]');
    expect(readSaved().groups).toBeUndefined();
  });
  it('sanitises damaged groups instead of crashing', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      groups: [{ id: 'g', name: 'Trip', people: 'nope', expenses: 'oops' }, { broken: true }],
    }));
    const { groups } = readSaved();
    expect(groups).toHaveLength(1);
    expect(groups[0].people).toEqual([]);
    expect(groups[0].expenses).toEqual([]);
  });
});

describe('guest state', () => {
  it('starts with one empty group on a fresh device', () => {
    const state = readGuestState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toMatchObject({ name: 'My first group', currencyCode: 'INR' });
    expect(state.savedPeople).toEqual([]);
  });

  it('round-trips through writeGuestState and gives old groups the saved currency', () => {
    const group = { ...newGroup('Trip'), people: ['A'] };
    delete group.currencyCode;
    writeGuestState({ groups: [group], savedPeople: ['A'], preferences: { currency: 'EUR' } });
    const state = readGuestState();
    expect(state.groups[0]).toMatchObject({ id: group.id, people: ['A'], currencyCode: 'EUR' });
    expect(state.savedPeople).toEqual(['A']);
  });

  it('drops v1 cloud copies (synced and unedited) but keeps edited or never-synced groups', () => {
    const synced = { ...newGroup('Synced'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const edited = { ...newGroup('Edited'), updatedAt: '2026-01-03T00:00:00.000Z' };
    const local = newGroup('Local');
    const meta = { userId: 'u', groups: { [synced.id]: synced.updatedAt, [edited.id]: '2026-01-02T00:00:00.000Z' } };
    expect(dropLegacyCloudCopies([synced, edited, local], meta).map((g) => g.name)).toEqual(['Edited', 'Local']);
    localStorage.setItem(STATE_KEY, JSON.stringify({ groups: [synced, local] }));
    localStorage.setItem(LEGACY_SYNC_META_KEY, JSON.stringify(meta));
    expect(readGuestState().groups.map((g) => g.name)).toEqual(['Local']);
  });

  it('clearGuestState removes everything', () => {
    writeGuestState({ groups: [newGroup('Trip')], savedPeople: [], preferences: {} });
    clearGuestState();
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('legacyGroup builds a sanitised first group from old data', () => {
    const group = legacyGroup({ names: ['A', 'a', 'B'], expenses: 'bad' });
    expect(group.people).toEqual(['A', 'B']);
    expect(group.expenses).toEqual([]);
    expect(isNonEmptyGroup(group)).toBe(true);
    expect(isNonEmptyGroup(legacyGroup({}))).toBe(false);
  });
});
