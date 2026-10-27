import { PERSON_NAME_MAX } from './limits';
import { SETTLE_EPSILON } from './splits';

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
  return expenses.some((e) => e.payer === name || (e.splitDetails && name in e.splitDetails))
    || payments.some((p) => p.payer === name || p.payee === name);
}

/** 'blocked' (still owes / is owed), 'confirm' (has history but settled), or 'free'. */
export function removalStatus(name, balances, expenses, payments) {
  const balance = balances[name]?.balance ?? 0;
  if (Math.abs(balance) > SETTLE_EPSILON) return 'blocked';
  return hasActivity(name, expenses, payments) ? 'confirm' : 'free';
}
