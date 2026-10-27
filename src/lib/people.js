import { PERSON_NAME_MAX } from './limits';

const key = (name) => name.trim().toLowerCase();

/**
 * Parses comma-separated names. Returns the valid new names plus the ones rejected
 * (duplicates of existing/earlier names, or longer than the limit).
 */
export function parseNames(raw, existing = [], max = PERSON_NAME_MAX) {
  const seen = new Set(existing.map(key));
  const result = { valid: [], duplicates: [], tooLong: [] };
  String(raw || '').split(',').map((name) => name.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach((name) => {
    if (name.length > max) result.tooLong.push(name);
    else if (seen.has(key(name))) result.duplicates.push(name);
    else { seen.add(key(name)); result.valid.push(name); }
  });
  return result;
}

/** Friendly message describing rejected names, or '' when nothing was rejected. */
export function describeRejected({ duplicates, tooLong }, max = PERSON_NAME_MAX) {
  const parts = [];
  if (duplicates.length) parts.push('already in the list: ' + duplicates.join(', '));
  if (tooLong.length) parts.push('longer than ' + max + ' characters: ' + tooLong.join(', '));
  return parts.join('; ');
}

function hasActivity(name, expenses, payments) {
  return expenses.some((e) => e.payer === name || (e.splitCents && name in e.splitCents))
    || payments.some((p) => p.payer === name || p.payee === name);
}

/**
 * 'blocked' (still owes / is owed), 'confirm' (has history but settled), or 'free'.
 * Settled means exactly zero cents, the same rule as the database's guard_person_removal().
 */
export function removalStatus(name, balances, expenses, payments) {
  if ((balances[name]?.balanceCents ?? 0) !== 0) return 'blocked';
  return hasActivity(name, expenses, payments) ? 'confirm' : 'free';
}
