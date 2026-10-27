// Money is integer cents (paise for INR) everywhere in the app: state, calculations, storage and the database.
// This file is the only place that turns typed text into cents or cents into text, and it does both with string
// arithmetic, so no amount ever passes through a floating-point number.

/** The database accepts amount_cents below 10^14, i.e. at most 12 digits before the decimal point. */
export const MAX_CENTS = 99999999999999;
const MAX_WHOLE_DIGITS = 12;
const MONEY_TEXT = /^(\d*)(?:\.(\d*))?$/;

export const isCents = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * Parses typed money ("120", "120.5", ".75", "120.") into integer cents.
 * Returns { cents } or { error } with a message that can be shown next to the field.
 */
export function parseMoneyInput(text, { allowZero = false } = {}) {
  const value = String(text ?? '').trim();
  const match = MONEY_TEXT.exec(value);
  if (!match || (!match[1] && !match[2])) return { error: 'Enter an amount like 120 or 120.50' };
  const [, whole, fraction = ''] = match;
  if (fraction.length > 2) return { error: 'Use at most 2 decimal places' };
  const digits = whole.replace(/^0+(?=\d)/, '') || '0';
  if (digits.length > MAX_WHOLE_DIGITS) return { error: 'That amount is too large' };
  // At most 12 + 2 digits, so these integers stay far below Number.MAX_SAFE_INTEGER.
  const cents = Number(digits) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents === 0 && !allowZero) return { error: 'Enter an amount greater than 0' };
  return { cents };
}

/** Cents as a plain decimal string ("1234.50", "-0.05"): for editable fields and exact currency formatting. */
export function centsToDecimal(cents) {
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return (cents < 0 ? '-' : '') + digits.slice(0, -2) + '.' + digits.slice(-2);
}

/**
 * Cents as a number in currency units (1050 -> 10.5). Output only: for the decimal fields that v2.0 clients read
 * (storage copy, backups, snapshots) and for CSV cells. Nothing in the app calculates with these numbers.
 */
export const centsToDecimalNumber = (cents) => Number(centsToDecimal(cents));

/** Sums integer cents. */
export const sumCents = (list) => list.reduce((total, cents) => total + (Number.isSafeInteger(cents) ? cents : 0), 0);

/**
 * Converts an amount saved by v2.0 and earlier (a decimal number in currency units, such as 100.5) to cents.
 * Only the backup/storage sanitiser calls this, once, when old data is read. Returns null when unusable.
 */
export function legacyAmountToCents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}
