// The activity bell's list: activity-log rows from the first load, reloads and live updates, merged into one list.
// Every row has a unique id (the log's identity column), which also orders rows by when they were written.

const idOf = (row) => Number(row?.id);
const isRow = (row) => Number.isSafeInteger(idOf(row)) && Boolean(row.group_id);

/** One list, newest first, with each row once (the newest copy of a row wins), at most `limit` rows. */
export function mergeActivity(current, incoming, limit) {
  const byId = new Map();
  [...current, ...incoming].filter(isRow).forEach((row) => byId.set(idOf(row), row));
  return [...byId.values()].sort((a, b) => idOf(b) - idOf(a)).slice(0, limit);
}

/** Only rows of groups the user can open right now (the groups loaded into the workspace). */
export const accessibleActivity = (rows, groupsById) => rows.filter((row) => groupsById.has(row.group_id));

/** The newest id in the list, or null for an empty list. */
export const newestActivityId = (rows) => (rows.length ? Math.max(...rows.map(idOf)) : null);

/** True when someone else did something after `seenId`. Nothing is unread before the first load set `seenId`. */
export const isUnread = (row, seenId, userId) => seenId !== null && idOf(row) > seenId && row.actor_id !== userId;
export const hasUnread = (rows, seenId, userId) => rows.some((row) => isUnread(row, seenId, userId));
