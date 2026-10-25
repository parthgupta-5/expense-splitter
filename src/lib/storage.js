// Everything that touches localStorage, plus the default shape of a group.
import { sanitizeGroup, sanitizeGroups } from './backup';

export const STATE_KEY = 'expenseSplitterStateV2';
export const THEME_KEY = 'expenseSplitterThemeV1';
export const LAST_USER_KEY = 'expenseSplitterLastUserV1';
export const SYNC_META_KEY = 'expenseSplitterSyncMetaV1';

export const makeId = () => (globalThis.crypto && globalThis.crypto.randomUUID
  ? globalThis.crypto.randomUUID()
  : 'g-' + Date.now() + '-' + Math.random().toString(16).slice(2));

export const newGroup = (name) => {
  const now = new Date().toISOString();
  return { id: makeId(), name, people: [], expenses: [], payments: [], savedSplits: [], createdAt: now, updatedAt: now };
};

const rawLegacyGroup = (saved) => ({
  id: makeId(),
  name: saved.groupName || 'My first group',
  people: Array.isArray(saved.names) ? saved.names : [],
  expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
  payments: Array.isArray(saved.payments) ? saved.payments : [],
  savedSplits: Array.isArray(saved.savedSplits) ? saved.savedSplits : [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Builds a sanitised group from old (V1) saved data, or an empty first group. */
export const legacyGroup = (saved) => sanitizeGroup(rawLegacyGroup(saved)).group;

export const readSaved = () => {
  try {
    const current = localStorage.getItem(STATE_KEY);
    const legacy = localStorage.getItem('expenseSplitterStateV1');
    const raw = JSON.parse(current || legacy || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    // Damaged or hand-edited storage must never crash the app on every reload.
    return { ...raw, groups: Array.isArray(raw.groups) ? sanitizeGroups(raw.groups).groups : undefined };
  } catch {
    return {};
  }
};

export const saveState = (state) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: the app keeps working in memory */
  }
};

export const readTheme = () => {
  try { return localStorage.getItem(THEME_KEY) === 'dark'; } catch { return false; }
};

export const saveTheme = (dark) => {
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
};

export const readLastUser = () => {
  try { return localStorage.getItem(LAST_USER_KEY); } catch { return null; }
};

export const writeLastUser = (userId) => {
  try { localStorage.setItem(LAST_USER_KEY, userId); } catch { /* ignore */ }
};

export const readSyncMeta = () => {
  try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}'); } catch { return {}; }
};

export const writeSyncMeta = (meta) => {
  try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
};

/** Removes every key that holds user data (used on sign-out). */
export const clearUserData = () => {
  try {
    [STATE_KEY, LAST_USER_KEY, SYNC_META_KEY].forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
};

export const isNonEmptyGroup = (group) => (
  (group.people?.length || 0) + (group.expenses?.length || 0) + (group.payments?.length || 0) > 0
);
