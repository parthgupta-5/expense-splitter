// Verbatim copy of src/lib/backup.js from the deployed v2.0 client (commit 2801059), used only by
// compatibility tests to prove that data written by this version still opens in the old client after a rollback.
// Sanitises data coming from untrusted sources: backup files, localStorage and the cloud.
import { isCurrency } from '../../lib/currency';
import { DESCRIPTION_MAX, GROUP_NAME_MAX, NOTE_MAX, PERSON_NAME_MAX } from '../../lib/limits';
import { toCents } from './splits';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_GROUPS = 100;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const money = (v) => (typeof v === 'number' || typeof v === 'string')
  && Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 1e12;
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString());
const text = (v, max) => String(v).trim().slice(0, max);

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
  if (!isObject(e) || !isText(e.payer) || !money(e.amount) || !isObject(e.splitDetails)) return null;
  const splitDetails = {};
  for (const [name, share] of Object.entries(e.splitDetails)) {
    const n = Number(share);
    if (!Number.isFinite(n) || n < 0) return null;
    splitDetails[name] = n;
  }
  // The shares must add up to the total exactly (in cents), the same rule the database enforces on every write.
  const sharesCents = Object.values(splitDetails).reduce((total, share) => total + toCents(share), 0);
  if (sharesCents !== toCents(e.amount)) return null;
  return {
    ...e,
    id: isText(e.id) ? e.id : crypto.randomUUID(),
    description: isText(e.description) ? text(e.description, DESCRIPTION_MAX) : 'Expense',
    payer: e.payer, amount: Number(e.amount), splitDetails,
    note: typeof e.note === 'string' ? e.note.slice(0, NOTE_MAX) : '',
    createdAt: iso(e.createdAt),
    participants: Array.isArray(e.participants) ? e.participants.filter(isText) : undefined,
  };
}

function cleanPayment(p) {
  if (!isObject(p) || !isText(p.payer) || !isText(p.payee) || p.payer === p.payee || !money(p.amount)) return null;
  return { ...p, id: isText(p.id) ? p.id : crypto.randomUUID(), amount: Number(p.amount), createdAt: iso(p.createdAt) };
}

function cleanSnapshot(s) {
  if (!isObject(s) || !isText(s.id)) return null;
  return {
    ...s,
    groupName: isText(s.groupName) ? text(s.groupName, GROUP_NAME_MAX) : 'Group',
    savedAt: iso(s.savedAt),
    people: Array.isArray(s.people) ? s.people.filter(isText) : [],
    expenses: Array.isArray(s.expenses) ? s.expenses.filter(isObject) : [],
    payments: Array.isArray(s.payments) ? s.payments.filter(isObject) : [],
    settlements: Array.isArray(s.settlements) ? s.settlements.filter(isObject) : [],
    total: Number.isFinite(Number(s.total)) ? Number(s.total) : 0,
    currencyCode: typeof s.currencyCode === 'string' ? s.currencyCode : 'INR',
  };
}

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
