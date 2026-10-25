// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STATE_KEY, clearUserData, isNonEmptyGroup, legacyGroup, readSaved, readSyncMeta, writeSyncMeta,
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
  it('returns an empty object for missing, invalid or non-object storage', () => {
    expect(readSaved()).toEqual({});
    localStorage.setItem(STATE_KEY, '{not json');
    expect(readSaved()).toEqual({});
    localStorage.setItem(STATE_KEY, '[1,2]');
    expect(readSaved()).toEqual({});
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
  it('keeps a valid saved state', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ groups: [{ id: 'g', name: 'Trip', people: ['A'] }], activeGroupId: 'g' }));
    const saved = readSaved();
    expect(saved.groups[0].people).toEqual(['A']);
    expect(saved.activeGroupId).toBe('g');
  });
});

describe('user data helpers', () => {
  it('clearUserData removes state and sync markers', () => {
    localStorage.setItem(STATE_KEY, '{}');
    writeSyncMeta({ userId: 'u' });
    clearUserData();
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(readSyncMeta()).toEqual({});
  });
  it('legacyGroup builds a sanitised first group from old data', () => {
    const group = legacyGroup({ names: ['A', 'a', 'B'], expenses: 'bad' });
    expect(group.people).toEqual(['A', 'B']);
    expect(group.expenses).toEqual([]);
    expect(isNonEmptyGroup(group)).toBe(true);
    expect(isNonEmptyGroup(legacyGroup({}))).toBe(false);
  });
});
