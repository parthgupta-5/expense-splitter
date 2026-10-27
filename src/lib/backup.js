// Sanitises data coming from untrusted sources: backup files, localStorage and the cloud, and writes data in forms
// older clients can still read.
// Money comes out as integer cents. Data saved by v2.0 and earlier kept decimal amounts (`amount`, `splitDetails`,
// `total`); when the cents fields are missing those are converted here, once, so the rest of the app only sees cents.
import { isCurrency } from './currency';
import { DESCRIPTION_MAX, GROUP_NAME_MAX, NOTE_MAX, PERSON_NAME_MAX } from './limits';
import {
  MAX_CENTS, centsToDecimalNumber, isCents, legacyAmountToCents, sumCents,
} from './money';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_GROUPS = 100;
// Only these split types keep their raw inputs (weights, not money) for editing later.
const WEIGHTED_SPLITS = new Set(['shares', 'percentages']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isAmount = (cents) => isCents(cents) && cents > 0 && cents <= MAX_CENTS;
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString());
const text = (v, max) => String(v).trim().slice(0, max);

/** Cents from the current field, or converted from the v2.0 decimal field. Null when neither is usable. */
const centsField = (item, key, legacyKey) => (key in item
  ? (isCents(item[key]) ? item[key] : null)
  : legacyAmountToCents(item[legacyKey]));

/** { name: cents } from `splitCents`, or from the v2.0 `splitDetails`. Null when any share is unusable. */
function splitField(item) {
  const source = 'splitCents' in item ? item.splitCents : item.splitDetails;
  if (!isObject(source)) return null;
  const split = {};
  for (const [name, share] of Object.entries(source)) {
    const cents = 'splitCents' in item ? share : legacyAmountToCents(share);
    if (!isCents(cents)) return null;
    split[name] = cents;
  }
  return split;
}

/** Drops the v2.0 decimal money fields from an object once their cents replacement is in place. */
const withoutLegacyMoney = ({
  amount: _amount, splitDetails: _splitDetails, total: _total, ...rest
}) => rest;

const withoutCents = ({
  amountCents: _amountCents, splitCents: _splitCents, totalCents: _totalCents, ...rest
}) => rest;

/** The v2.0 decimal fields (`amount`, `splitDetails`) for an expense, payment or settlement held in cents. */
function decimalFields(item) {
  const fields = {};
  if (isCents(item.amountCents)) fields.amount = centsToDecimalNumber(item.amountCents);
  if (isObject(item.splitCents)) {
    fields.splitDetails = Object.fromEntries(
      Object.entries(item.splitCents).map(([name, cents]) => [name, centsToDecimalNumber(cents)]),
    );
  }
  return fields;
}

/** Adds the decimal fields; with keepCents false the cents fields are removed, leaving exactly the v2.0 shape. */
function withDecimals(item, keepCents) {
  return { ...(keepCents ? item : withoutCents(item)), ...decimalFields(item) };
}

function snapshotWithDecimals(snapshot, keepCents) {
  const lists = Object.fromEntries(['expenses', 'payments', 'settlements']
    .filter((key) => Array.isArray(snapshot[key]))
    .map((key) => [key, snapshot[key].filter(isObject).map((item) => withDecimals(item, keepCents))]));
  return {
    ...(keepCents ? snapshot : withoutCents(snapshot)),
    total: centsToDecimalNumber(isCents(snapshot.totalCents) ? snapshot.totalCents : 0),
    ...lists,
  };
}

function groupWithDecimals(group, keepCents) {
  const list = (value) => (Array.isArray(value) ? value.map((item) => withDecimals(item, keepCents)) : value);
  return {
    ...group,
    expenses: list(group.expenses),
    payments: list(group.payments),
    savedSplits: Array.isArray(group.savedSplits)
      ? group.savedSplits.map((snapshot) => snapshotWithDecimals(snapshot, keepCents))
      : group.savedSplits,
  };
}

/**
 * A saved split for storing outside this device's state (cloud rows, backups): cents fields for this version plus
 * the decimal fields the v2.0 client shows, so a snapshot saved here still displays after a rollback.
 */
export const portableSnapshot = (snapshot) => snapshotWithDecimals(snapshot, true);

/** A group for a backup file: cents fields plus v2.0 decimal fields, so either client version can import it. */
export const portableGroup = (group) => groupWithDecimals(group, true);

/** A group in exactly the v2.0 shape (decimal amounts, no cents fields): the copy kept for the v2.0 client. */
export const v2Group = (group) => groupWithDecimals(group, false);

function cleanList(list, cleaner, stats) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) { stats.skipped += 1; return []; }
  return list.flatMap((item) => {
    const cleaned = cleaner(item);
    if (cleaned === null) { stats.skipped += 1; return []; }
    return [cleaned];
  });
}

function cleanExpense(e) {
  if (!isObject(e) || !isText(e.payer)) return null;
  const amountCents = centsField(e, 'amountCents', 'amount');
  const splitCents = splitField(e);
  if (!isAmount(amountCents) || !splitCents) return null;
  // The shares must add up to the total exactly, the same rule the database enforces on every write.
  if (sumCents(Object.values(splitCents)) !== amountCents) return null;
  return {
    ...withoutLegacyMoney(e),
    id: isText(e.id) ? e.id : crypto.randomUUID(),
    description: isText(e.description) ? text(e.description, DESCRIPTION_MAX) : 'Expense',
    payer: e.payer, amountCents, splitCents,
    // v2.0 kept custom amounts as decimals here; they equal splitCents, so only weights are kept.
    splitValues: WEIGHTED_SPLITS.has(e.splitType) && isObject(e.splitValues) ? e.splitValues : undefined,
    note: typeof e.note === 'string' ? e.note.slice(0, NOTE_MAX) : '',
    createdAt: iso(e.createdAt),
    participants: Array.isArray(e.participants) ? e.participants.filter(isText) : undefined,
  };
}

function cleanPayment(p) {
  if (!isObject(p) || !isText(p.payer) || !isText(p.payee) || p.payer === p.payee) return null;
  const amountCents = centsField(p, 'amountCents', 'amount');
  if (!isAmount(amountCents)) return null;
  return { ...withoutLegacyMoney(p), id: isText(p.id) ? p.id : crypto.randomUUID(), amountCents, createdAt: iso(p.createdAt) };
}

/** A read-only record, so damaged amounts show as zero instead of dropping the item. */
const snapshotItem = (item) => ({
  ...withoutLegacyMoney(item),
  amountCents: centsField(item, 'amountCents', 'amount') ?? 0,
  ...('splitCents' in item || 'splitDetails' in item ? { splitCents: splitField(item) ?? {} } : {}),
});

/** Saved split snapshots (from this device, a backup or the cloud) in the current cents format. */
export function normalizeSnapshot(s) {
  const list = (value) => (Array.isArray(value) ? value.filter(isObject).map(snapshotItem) : []);
  return {
    ...withoutLegacyMoney(s),
    groupName: isText(s.groupName) ? text(s.groupName, GROUP_NAME_MAX) : 'Group',
    savedAt: iso(s.savedAt),
    people: Array.isArray(s.people) ? s.people.filter(isText) : [],
    expenses: list(s.expenses),
    payments: list(s.payments),
    settlements: list(s.settlements),
    totalCents: centsField(s, 'totalCents', 'total') ?? 0,
    currencyCode: typeof s.currencyCode === 'string' ? s.currencyCode : 'INR',
  };
}

const cleanSnapshot = (s) => (isObject(s) && isText(s.id) ? normalizeSnapshot(s) : null);

/** Returns { group, skipped } or { group: null } when the group itself is unusable. */
export function sanitizeGroup(raw) {
  const stats = { skipped: 0 };
  if (!isObject(raw) || !isText(raw.id) || !isText(raw.name)) return { group: null, skipped: 1 };
  const seen = new Set();
  const people = cleanList(raw.people, (p) => {
    if (!isText(p)) return null;
    const name = text(p, PERSON_NAME_MAX);
    if (seen.has(name.toLowerCase())) return null;
    seen.add(name.toLowerCase());
    return name;
  }, stats);
  const group = {
    ...raw,
    id: raw.id,
    name: text(raw.name, GROUP_NAME_MAX),
    currencyCode: isCurrency(raw.currencyCode) ? raw.currencyCode : undefined,
    people,
    expenses: cleanList(raw.expenses, cleanExpense, stats),
    payments: cleanList(raw.payments, cleanPayment, stats),
    savedSplits: cleanList(raw.savedSplits, cleanSnapshot, stats),
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
  };
  return { group, skipped: stats.skipped };
}

export function sanitizeGroups(rawGroups) {
  if (!Array.isArray(rawGroups)) return { groups: [], skipped: rawGroups === undefined ? 0 : 1 };
  let skipped = Math.max(0, rawGroups.length - MAX_GROUPS);
  const ids = new Set();
  const groups = [];
  rawGroups.slice(0, MAX_GROUPS).forEach((item) => {
    const result = sanitizeGroup(item);
    skipped += result.skipped;
    if (result.group && !ids.has(result.group.id)) { ids.add(result.group.id); groups.push(result.group); }
  });
  return { groups, skipped };
}

/** Throws an Error with a friendly message when the file is not a usable backup. */
export function sanitizeBackup(raw) {
  if (!isObject(raw) || !Array.isArray(raw.groups)) {
    throw new Error('This file does not contain a valid Expense Splitter backup.');
  }
  const { groups, skipped } = sanitizeGroups(raw.groups);
  if (!groups.length) throw new Error('No usable groups were found in this backup.');
  const people = Array.isArray(raw.savedPeople)
    ? raw.savedPeople.filter(isText).map((n) => text(n, PERSON_NAME_MAX))
    : [];
  const preferences = isObject(raw.preferences) ? raw.preferences : {};
  return { groups, savedPeople: [...new Set(people)], preferences, skipped };
}

/** Parses a backup file's text, enforcing the size limit. */
export function parseBackupText(textContent, sizeBytes = textContent.length) {
  if (sizeBytes > MAX_BACKUP_BYTES) throw new Error('This file is too large to be a backup (limit 2 MB).');
  let raw;
  try { raw = JSON.parse(textContent); } catch { throw new Error('This file is not valid JSON.'); }
  return sanitizeBackup(raw);
}
