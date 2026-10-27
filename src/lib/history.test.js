import { describe, expect, it } from 'vitest';
import { collectActivity, collectSnapshots } from './history';

const groups = [
  { id: 'a', name: 'A', expenses: [{ id: 1, createdAt: '2026-01-01' }], payments: [{ id: 2, createdAt: '2026-03-01' }],
    savedSplits: [{ id: 's1', savedAt: '2026-02-01' }] },
  { id: 'b', name: 'B', expenses: [{ id: 3, createdAt: '2026-02-01' }], savedSplits: [{ id: 's2', savedAt: '2026-04-01' }] },
];

describe('history', () => {
  it('orders activity newest first and tags kind and group', () => {
    const items = collectActivity(groups);
    expect(items.map((i) => i.id)).toEqual([2, 3, 1]);
    expect(items[0]).toMatchObject({ kind: 'payment', groupId: 'a', groupName: 'A' });
    expect(items[1]).toMatchObject({ kind: 'expense', groupId: 'b', groupName: 'B' });
  });
  it('orders snapshots newest first with their group id', () => {
    expect(collectSnapshots(groups).map((s) => [s.id, s.groupId])).toEqual([['s2', 'b'], ['s1', 'a']]);
  });
});
