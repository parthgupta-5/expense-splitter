// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_STATE_KEYS, LEGACY_SYNC_META_KEY, MIRROR_MARK, STATE_KEY, clearGuestState, dropLegacyCloudCopies, isNonEmptyGroup,
  legacyGroup, newGroup, readActivitySeen, readGuestState, readSaved, writeActivitySeen, writeGuestState,
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

  it('opens data saved by v2.0 in decimals as cents, then keeps a v2.0-shaped copy up to date', () => {
    const [v2Key] = LEGACY_STATE_KEYS;
    const v2 = JSON.stringify({
      groups: [{
        id: 'old', name: 'Old trip', people: ['Asha', 'Ben'],
        expenses: [{ id: 'e', description: 'Hotel', payer: 'Asha', amount: 100.5, splitType: 'shares',
          splitDetails: { Asha: 67, Ben: 33.5 }, splitValues: { Asha: 2, Ben: 1 } }],
        payments: [{ id: 'p', payer: 'Ben', payee: 'Asha', amount: 10.25 }],
        savedSplits: [{ id: 's', groupName: 'Old trip', total: 100.5, settlements: [{ payer: 'Ben', payee: 'Asha', amount: 33.5 }] }],
      }],
    });
    localStorage.setItem(v2Key, v2);
    const state = readGuestState();
    const [group] = state.groups;
    expect(group.expenses[0]).toMatchObject({ amountCents: 10050, splitCents: { Asha: 6700, Ben: 3350 }, splitValues: { Asha: 2, Ben: 1 } });
    expect(group.payments[0].amountCents).toBe(1025);
    expect(group.savedSplits[0]).toMatchObject({ totalCents: 10050, settlements: [{ payer: 'Ben', payee: 'Asha', amountCents: 3350 }] });

    writeGuestState(state);
    expect(JSON.parse(localStorage.getItem(STATE_KEY)).groups[0].expenses[0].amountCents).toBe(10050);
    // V2 is now this version's marked mirror, still in decimals (rollback cases are covered in compat.test.js).
    const mirror = JSON.parse(localStorage.getItem(v2Key));
    expect(mirror[MIRROR_MARK]).toBe(true);
    expect(mirror.groups[0].expenses[0]).toMatchObject({ amount: 100.5, splitDetails: { Asha: 67, Ben: 33.5 } });
    expect(mirror.groups[0].expenses[0]).not.toHaveProperty('amountCents');
    expect(readGuestState().groups[0].expenses[0].amountCents).toBe(10050); // the cents copy now wins
  });

  it('clearGuestState removes everything, including older copies', () => {
    writeGuestState({ groups: [newGroup('Trip')], savedPeople: [], preferences: {} });
    LEGACY_STATE_KEYS.forEach((key) => localStorage.setItem(key, '{}'));
    clearGuestState();
    [STATE_KEY, ...LEGACY_STATE_KEYS].forEach((key) => expect(localStorage.getItem(key)).toBeNull());
  });

  it('legacyGroup builds a sanitised first group from old data', () => {
    const group = legacyGroup({ names: ['A', 'a', 'B'], expenses: 'bad' });
    expect(group.people).toEqual(['A', 'B']);
    expect(group.expenses).toEqual([]);
    expect(isNonEmptyGroup(group)).toBe(true);
    expect(isNonEmptyGroup(legacyGroup({}))).toBe(false);
  });
});

describe('activity seen marker (signed in, this device only)', () => {
  it('is kept per account and ignores damaged values', () => {
    expect(readActivitySeen('u1')).toBeNull();
    writeActivitySeen('u1', 12);
    writeActivitySeen('u2', 3);
    expect(readActivitySeen('u1')).toBe(12);
    expect(readActivitySeen('u2')).toBe(3);
    localStorage.setItem('expenseSplitterActivitySeenV1', JSON.stringify({ u1: 'lots', u2: -4 }));
    expect(readActivitySeen('u1')).toBeNull();
    expect(readActivitySeen('u2')).toBeNull();
    localStorage.setItem('expenseSplitterActivitySeenV1', '{broken');
    expect(readActivitySeen('u1')).toBeNull();
  });
});
