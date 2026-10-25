import { describe, expect, it } from 'vitest';
import { mergeGroups } from './sync';

const g = (id, updatedAt, extra = {}) => ({ id, name: 'G' + id, people: [], expenses: [], payments: [], savedSplits: [], updatedAt, ...extra });
const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';
const T3 = '2026-10-03T10:00:00.000Z';

describe('mergeGroups', () => {
  it('keeps a brand-new local group so it uploads', () => {
    const r = mergeGroups({ local: [g('a', T1)], cloud: [], meta: {}, userId: 'u1' });
    expect(r.groups.map((x) => x.id)).toEqual(['a']);
    expect(r.droppedLocal).toEqual([]);
  });

  it('drops an unchanged local group that was deleted on another device', () => {
    const meta = { userId: 'u1', groups: { a: T1 } };
    const r = mergeGroups({ local: [g('a', T1)], cloud: [], meta, userId: 'u1' });
    expect(r.groups).toEqual([]);
    expect(r.droppedLocal).toEqual(['Ga']);
  });

  it('keeps a local group that was edited after the other device deleted it', () => {
    const meta = { userId: 'u1', groups: { a: T1 } };
    expect(mergeGroups({ local: [g('a', T2)], cloud: [], meta, userId: 'u1' }).groups).toHaveLength(1);
  });

  it('keeps the newer local edit', () => {
    const meta = { userId: 'u1', groups: { a: T1 } };
    const local = g('a', T3, { people: ['Asha'] });
    const r = mergeGroups({ local: [local], cloud: [g('a', T2)], meta, userId: 'u1' });
    expect(r.groups[0].people).toEqual(['Asha']);
    expect(r.replacedLocal).toEqual([]);
  });

  it('takes the newer cloud edit and reports a replaced unsynced local edit', () => {
    const meta = { userId: 'u1', groups: { a: T1 } };
    const local = g('a', T2, { people: ['Old'] });
    const cloud = g('a', T3, { people: ['New'] });
    const r = mergeGroups({ local: [local], cloud: [cloud], meta, userId: 'u1' });
    expect(r.groups[0].people).toEqual(['New']);
    expect(r.replacedLocal).toEqual(['Ga']);
  });

  it('does not report a replacement when the local copy was already synced', () => {
    const meta = { userId: 'u1', groups: { a: T1 } };
    const r = mergeGroups({ local: [g('a', T1)], cloud: [g('a', T3, { people: ['New'] })], meta, userId: 'u1' });
    expect(r.replacedLocal).toEqual([]);
  });

  it('ignores local data entirely for a different account', () => {
    const r = mergeGroups({ local: [g('a', T3)], cloud: [g('b', T1)], meta: {}, userId: 'u2', isNewAccount: true });
    expect(r.groups.map((x) => x.id)).toEqual(['b']);
  });

  it('a guest signing in for the first time keeps and uploads their groups', () => {
    const r = mergeGroups({ local: [g('a', T1)], cloud: [g('b', T2)], meta: {}, userId: 'u1' });
    expect(r.groups.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});
