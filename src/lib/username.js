// Usernames (@handles). The database decides (set_username() in 2026102901_profiles_usernames.sql); these mirror its
// rules so the form can explain a problem before asking the server. A username is only a label for finding people:
// ownership and access always use the account's user id.

export const USERNAME_CHANGE_DAYS = 30;
const PATTERN = /^[a-z][a-z0-9_]{2,19}$/;
// Keep in step with public.reserved_usernames.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'security', 'staff', 'team', 'official', 'moderator',
  'mod', 'owner', 'billing', 'api', 'auth', 'login', 'logout', 'signin', 'signup', 'settings', 'profile', 'account',
  'groups', 'group', 'history', 'people', 'invite', 'invites', 'notifications', 'me', 'you', 'everyone', 'all', 'guest',
  'anonymous', 'null', 'undefined', 'expense', 'expenses', 'splitter', 'expensesplitter', 'supabase', 'google', 'www',
  'mail', 'email', 'user', 'username', 'test',
]);

export const USERNAME_RULES = 'Use 3–20 characters: lowercase letters, numbers or _, starting with a letter';

/** Trims, removes one leading @ and lowercases ("  @Asha_Rao " -> "asha_rao"), as the database does. */
export const normalizeUsername = (value) => String(value ?? '').trim().replace(/^@/, '').toLowerCase();

/** A message for a (normalised) name the database would refuse, or null. Only ASCII passes, so no look-alikes. */
export function usernameProblem(name) {
  if (!PATTERN.test(name)) return USERNAME_RULES;
  if (name.startsWith('user_') || RESERVED.has(name)) return 'That username is reserved';
  return null;
}

/** True once the profile has a username column (migration applied) but its owner has not chosen one yet. */
export const needsUsername = (profile) => Boolean(profile && profile.username && !profile.username_confirmed_at);

/** When a chosen username may next be changed, or null if it may be changed now. */
export function nextUsernameChange(profile, now = new Date()) {
  if (!profile?.username_confirmed_at || !profile.username_changed_at) return null;
  const next = new Date(profile.username_changed_at);
  next.setDate(next.getDate() + USERNAME_CHANGE_DAYS);
  return next > now ? next : null;
}
