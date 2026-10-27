// Everything that touches localStorage, plus the default shape of a group.
// Only guest (signed-out) data is stored here. Signed-in data lives in Supabase and is never written to the device.
import { sanitizeGroup, sanitizeGroups } from './backup';
import { DEFAULT_CURRENCY, isCurrency } from './currency';

export const STATE_KEY = 'expenseSplitterStateV2';
export const THEME_KEY = 'expenseSplitterThemeV1';
export const LAST_GROUP_KEY = 'expenseSplitterLastGroupV1';
// Written by v1.x while signed in. Read once to tell cloud copies apart from real guest data, then removed.
export const LEGACY_LAST_USER_KEY = 'expenseSplitterLastUserV1';
export const LEGACY_SYNC_META_KEY = 'expenseSplitterSyncMetaV1';

export const makeId = () => (globalThis.crypto && globalThis.crypto.randomUUID
  ? globalThis.crypto.randomUUID()
  : 'g-' + Date.now() + '-' + Math.random().toString(16).slice(2));

export const newGroup = (name, currencyCode = DEFAULT_CURRENCY) => {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name,
    currencyCode: isCurrency(currencyCode) ? currencyCode : DEFAULT_CURRENCY,
    people: [],
    expenses: [],
    payments: [],
    savedSplits: [],
    createdAt: now,
    updatedAt: now,
  };
};

const rawLegacyGroup = (saved) => ({
  ...newGroup(saved.groupName || 'My first group', saved.preferences?.currency),
  people: Array.isArray(saved.names) ? saved.names : [],
  expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
  payments: Array.isArray(saved.payments) ? saved.payments : [],
  savedSplits: Array.isArray(saved.savedSplits) ? saved.savedSplits : [],
});

/** Builds a sanitised group from old (V1) saved data, or an empty first group. */
export const legacyGroup = (saved = {}) => sanitizeGroup(rawLegacyGroup(saved)).group;

const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* storage full or unavailable: keep working in memory */ }
};
const remove = (key) => {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
};

const parseObject = (text) => {
  try {
    const value = JSON.parse(text || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

/** Raw saved state, sanitised so damaged or hand-edited storage can never crash the app. */
export const readSaved = () => {
  const raw = parseObject(read(STATE_KEY) || read('expenseSplitterStateV1'));
  return { ...raw, groups: Array.isArray(raw.groups) ? sanitizeGroups(raw.groups).groups : undefined };
};

/**
 * v1.x kept signed-in cloud groups in the same storage as guest groups. Groups that were synced and not edited
 * since are cloud copies, so they are dropped here instead of being offered for import as "guest" data.
 */
export function dropLegacyCloudCopies(groups, syncMeta) {
  const synced = syncMeta && typeof syncMeta.groups === 'object' && syncMeta.groups ? syncMeta.groups : {};
  return groups.filter((group) => synced[group.id] !== group.updatedAt);
}

/** Guest workspace: groups, saved people and preferences. Always returns at least one group. */
export function readGuestState() {
  const saved = readSaved();
  const legacyMeta = parseObject(read(LEGACY_SYNC_META_KEY));
  const fallbackCurrency = isCurrency(saved.preferences?.currency) ? saved.preferences.currency : DEFAULT_CURRENCY;
  let groups = Array.isArray(saved.groups) && saved.groups.length ? saved.groups : [legacyGroup(saved)];
  groups = dropLegacyCloudCopies(groups, legacyMeta)
    .map((group) => ({ ...group, currencyCode: isCurrency(group.currencyCode) ? group.currencyCode : fallbackCurrency }));
  if (!groups.length) groups = [legacyGroup({ preferences: saved.preferences })];
  return {
    groups,
    savedPeople: Array.isArray(saved.savedPeople) ? saved.savedPeople.filter((n) => typeof n === 'string') : [],
    preferences: saved.preferences && typeof saved.preferences === 'object' ? saved.preferences : {},
  };
}

export function writeGuestState({ groups, savedPeople, preferences }) {
  write(STATE_KEY, JSON.stringify({ groups, savedPeople, preferences }));
  remove(LEGACY_SYNC_META_KEY);
  remove(LEGACY_LAST_USER_KEY);
}

/** Removes all guest data (after it has been moved into an account, or when the user discards it). */
export function clearGuestState() {
  [STATE_KEY, 'expenseSplitterStateV1', LEGACY_SYNC_META_KEY, LEGACY_LAST_USER_KEY].forEach(remove);
}

export const readTheme = () => read(THEME_KEY) === 'dark';
export const saveTheme = (dark) => write(THEME_KEY, dark ? 'dark' : 'light');

export const readLastGroup = () => read(LAST_GROUP_KEY);
export const writeLastGroup = (groupId) => (groupId ? write(LAST_GROUP_KEY, groupId) : remove(LAST_GROUP_KEY));

export const isNonEmptyGroup = (group) => (
  (group.people?.length || 0) + (group.expenses?.length || 0) + (group.payments?.length || 0) > 0
);
