import { describe, expect, it } from 'vitest';
import {
  accessibleActivity, hasUnread, isUnread, mergeActivity, newestActivityId,
} from './activityFeed';

const row = (id, groupId = 'g-1', actorId = 'u-other') => ({
  id, group_id: groupId, actor_id: actorId, action: 'expense_added', details: {},
});

describe('mergeActivity', () => {
  it('orders newest first and keeps each row once when history and live updates overlap', () => {
    const history = [row(3), row(2), row(1)];
    const live = [row(4), row(3), { ...row(2), action: 'expense_updated' }];
    const merged = mergeActivity(history, live, 10);
    expect(merged.map((item) => item.id)).toEqual([4, 3, 2, 1]);
    expect(merged.find((item) => item.id === 2).action).toBe('expense_updated');
  });

  it('accepts ids as strings (bigint) and drops rows without an id or group', () => {
    expect(mergeActivity([row('10')], [row(9), { id: 8 }, { group_id: 'g-1' }, null], 10).map((item) => Number(item.id)))
      .toEqual([10, 9]);
  });

  it('keeps only the newest rows', () => {
    expect(mergeActivity([], [row(1), row(2), row(3)], 2).map((item) => item.id)).toEqual([3, 2]);
  });
});

describe('accessibleActivity', () => {
  it('drops rows of groups the user cannot open any more', () => {
    const groups = new Map([['g-1', {}]]);
    expect(accessibleActivity([row(2, 'g-gone'), row(1, 'g-1')], groups).map((item) => item.id)).toEqual([1]);
  });
});

describe('unread', () => {
  it("is only someone else's activity after the last seen id", () => {
    expect(isUnread(row(5), 4, 'u-me')).toBe(true);
    expect(isUnread(row(4), 4, 'u-me')).toBe(false);
    expect(isUnread(row(5, 'g-1', 'u-me'), 4, 'u-me')).toBe(false);
    expect(hasUnread([row(5, 'g-1', 'u-me'), row(3)], 4, 'u-me')).toBe(false);
  });

  it('is never unread before the first load', () => {
    expect(hasUnread([row(5)], null, 'u-me')).toBe(false);
  });

  it('finds the newest id', () => {
    expect(newestActivityId([row(2), row(7), row(3)])).toBe(7);
    expect(newestActivityId([])).toBeNull();
  });
});
