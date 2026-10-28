// Everything that touches localStorage, plus the default shape of a group.
// Only guest (signed-out) data is stored here. Signed-in data lives in Supabase and is never written to the device;
// for signed-in users only device conveniences are kept (appearance, last opened group, the bell's last-seen id).
import { sanitizeGroup, sanitizeGroups, v2Group } from './backup';
import { DEFAULT_CURRENCY, isCurrency } from './currency';

// V3 is this version's copy, with money in integer cents. Every save also writes the same data to V2 in the v2.0
// shape (decimal amounts), marked with MIRROR_MARK, so rolling back to the v2.0 client keeps every change. The v2.0
// client rewrites V2 without the mark; a V2 without it is therefore newer than V3 and is the copy that is opened.
export const STATE_KEY = 'expenseSplitterStateV3';
export const V2_STATE_KEY = 'expenseSplitterStateV2';
export const LEGACY_STATE_KEYS = [V2_STATE_KEY, 'expenseSplitterStateV1'];
export const MIRROR_MARK = 'mirroredFromV3';
const THEME_KEY = 'expenseSplitterThemeV1';
const LAST_GROUP_KEY = 'expenseSplitterLastGroupV1';
const ACTIVITY_SEEN_KEY = 'expenseSplitterActivitySeenV1';
// Written by v1.x while signed in. Read once to tell cloud copies apart from real guest data, then removed.
const LEGACY_LAST_USER_KEY = 'expenseSplitterLastUserV1';
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
/** Resolves to false when the value could not be stored (storage full or unavailable: keep working in memory). */
const write = (key, value) => {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
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

/** True for a V2 copy saved by the v2.0 client (a usable copy without this version's mark). */
const savedByV2Client = (text) => {
  if (!text) return false;
  const value = parseObject(text);
  return Array.isArray(value.groups) && !value[MIRROR_MARK];
};

/** The saved copy to open: V3, unless the v2.0 client saved V2 after it (a rollback); then V2, then V1. */
function savedText() {
  const v3 = read(STATE_KEY);
  const v2 = read(V2_STATE_KEY);
  if (v3 && !savedByV2Client(v2)) return v3;
  return v2 || read('expenseSplitterStateV1');
}

/** Raw saved state, sanitised so damaged or hand-edited storage can never crash the app. */
export const readSaved = () => {
  const raw = parseObject(savedText());
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
  if (write(STATE_KEY, JSON.stringify({ groups, savedPeople, preferences }))) {
    const mirror = { groups: groups.map(v2Group), savedPeople, preferences, [MIRROR_MARK]: true };
    // A V2 copy that cannot be updated is removed rather than left stale: an unmarked stale copy would look newer.
    if (!write(V2_STATE_KEY, JSON.stringify(mirror))) remove(V2_STATE_KEY);
  }
  remove(LEGACY_SYNC_META_KEY);
  remove(LEGACY_LAST_USER_KEY);
}

/** Removes all guest data (after it has been moved into an account, or when the user discards it). */
export function clearGuestState() {
  [STATE_KEY, ...LEGACY_STATE_KEYS, LEGACY_SYNC_META_KEY, LEGACY_LAST_USER_KEY].forEach(remove);
}

export const readTheme = () => read(THEME_KEY) === 'dark';
export const saveTheme = (dark) => write(THEME_KEY, dark ? 'dark' : 'light');

export const readLastGroup = () => read(LAST_GROUP_KEY);
export const writeLastGroup = (groupId) => (groupId ? write(LAST_GROUP_KEY, groupId) : remove(LAST_GROUP_KEY));

// The newest activity id each account has seen in the bell, on this device only. It is never sent to the server, so
// the unread dot is per browser. Holds only account ids and activity ids, no group data.
const activitySeen = () => parseObject(read(ACTIVITY_SEEN_KEY));
/** The newest activity id this account has seen here, or null when it has never opened the bell on this device. */
export const readActivitySeen = (userId) => {
  const value = Number(activitySeen()[userId]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};
export const writeActivitySeen = (userId, activityId) => {
  const all = activitySeen();
  all[userId] = activityId;
  write(ACTIVITY_SEEN_KEY, JSON.stringify(all));
};

// The pending invitations each account has already seen in the bell, on this device only (ids, nothing else). Seeing an
// invitation only clears the bell's count: it stays pending until it is accepted or declined.
const INVITATIONS_SEEN_KEY = 'expenseSplitterInvitationsSeenV1';
/** Storage keys whose changes in another tab should update the bell here. */
export const SEEN_KEYS = { activity: ACTIVITY_SEEN_KEY, invitations: INVITATIONS_SEEN_KEY };
const invitationsSeen = () => parseObject(read(INVITATIONS_SEEN_KEY));
export const readInvitationsSeen = (userId) => {
  const ids = invitationsSeen()[userId];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
};
export const writeInvitationsSeen = (userId, ids) => {
  const all = invitationsSeen();
  all[userId] = ids;
  write(INVITATIONS_SEEN_KEY, JSON.stringify(all));
};

/** After an account is deleted: removes what this device remembered about it (bell markers, last opened group). */
export function forgetAccountOnDevice(userId) {
  [ACTIVITY_SEEN_KEY, INVITATIONS_SEEN_KEY].forEach((key) => {
    const all = parseObject(read(key));
    if (!(userId in all)) return;
    delete all[userId];
    write(key, JSON.stringify(all));
  });
  remove(LAST_GROUP_KEY);
}

export const isNonEmptyGroup = (group) => (
  (group.people?.length || 0) + (group.expenses?.length || 0) + (group.payments?.length || 0) > 0
);
