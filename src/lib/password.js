// The password policy for new and reset passwords. Supabase Auth enforces the same policy on the server (Dashboard:
// Authentication -> Providers -> Email -> Password requirements); these checks only explain it while typing.
// Signing in never applies them, so accounts made under the older 8-character rule keep working.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72; // Supabase Auth refuses longer passwords
// The symbols Supabase Auth counts: !@#$%^&*()_+-=[]{};':"|<>?,./`~
const SYMBOL = /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (value) => value.length >= PASSWORD_MIN_LENGTH },
  { id: 'lower', label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
  { id: 'upper', label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'number', label: 'A number', test: (value) => /[0-9]/.test(value) },
  { id: 'symbol', label: 'A symbol, such as ! # or ?', test: (value) => SYMBOL.test(value) },
];

/** Each rule with whether `password` meets it. */
export const checkPassword = (password) => PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(String(password ?? '')) }));

/** A message for a new password that breaks the policy, or null. */
export function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const missing = checkPassword(value).filter((rule) => !rule.met);
  if (!missing.length) return null;
  return 'Your password needs: ' + missing.map((rule) => rule.label.toLowerCase()).join(', ') + '.';
}
