const byDateDesc = (field) => (a, b) => new Date(b[field] || 0) - new Date(a[field] || 0);

/** All expenses and payments across groups, newest first. */
export function collectActivity(groups) {
  return groups.flatMap((group) => [
    ...(group.expenses || []).map((expense) => ({ ...expense, kind: 'expense', groupId: group.id, groupName: group.name })),
    ...(group.payments || []).map((payment) => ({ ...payment, kind: 'payment', groupId: group.id, groupName: group.name })),
  ]).sort(byDateDesc('createdAt'));
}

/** All saved split snapshots across groups, newest first. */
export function collectSnapshots(groups) {
  return groups
    .flatMap((group) => (group.savedSplits || []).map((snapshot) => ({ ...snapshot, groupId: group.id })))
    .sort(byDateDesc('savedAt'));
}
