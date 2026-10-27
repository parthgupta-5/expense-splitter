import { describe, expect, it } from 'vitest';
import {
  findGroup, groupPath, groupSlugs, slugify,
} from './groupSlug';

const group = (id, name, createdAt) => ({ id, name, createdAt });

describe('slugify', () => {
  it('makes a readable lowercase address from a name', () => {
    expect(slugify('Goa Trip')).toBe('goa-trip');
    expect(slugify('  Flat 4B — rent & bills!! ')).toBe('flat-4b-rent-bills');
    expect(slugify('Café Münich')).toBe('cafe-munich');
  });

  it('never returns an empty or unsafe slug', () => {
    expect(slugify('')).toBe('group');
    expect(slugify('!!!')).toBe('group');
    expect(slugify('गोवा यात्रा')).toBe('group');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('a/b?c=d#e')).toBe('a-b-c-d-e');
    expect(slugify(undefined)).toBe('group');
  });

  it('keeps addresses short', () => {
    const slug = slugify('word '.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('groupSlugs', () => {
  it('numbers groups that share a name; the older one keeps the plain name', () => {
    const groups = [
      group('c', 'Goa Trip', '2026-03-01'),
      group('a', 'Goa Trip', '2026-01-01'),
      group('b', 'goa trip', '2026-02-01'),
      group('d', 'Rent', '2026-04-01'),
    ];
    const slugs = groupSlugs(groups);
    expect(slugs.get('a')).toBe('goa-trip');
    expect(slugs.get('b')).toBe('goa-trip-2');
    expect(slugs.get('c')).toBe('goa-trip-3');
    expect(slugs.get('d')).toBe('rent');
  });

  it('gives the same result whatever order the groups arrive in', () => {
    const groups = [group('a', 'X', '2026-01-01'), group('b', 'X', '2026-01-02')];
    expect([...groupSlugs([...groups].reverse())]).toEqual([...groupSlugs(groups)].reverse().sort());
  });

  it('does not let a numbered slug collide with a group that is really called that', () => {
    const slugs = groupSlugs([
      group('a', 'Trip', '2026-01-01'), group('b', 'Trip', '2026-01-02'), group('c', 'Trip 2', '2026-01-03'),
    ]);
    expect(new Set(slugs.values()).size).toBe(3);
  });
});

describe('findGroup and groupPath', () => {
  const groups = [group('11111111-aaaa', 'Goa Trip', '2026-01-01'), group('22222222-bbbb', 'Rent', '2026-01-02')];

  it('finds a group by its slug or by its id (old links)', () => {
    expect(findGroup(groups, 'rent').id).toBe('22222222-bbbb');
    expect(findGroup(groups, '11111111-aaaa').id).toBe('11111111-aaaa');
    expect(findGroup(groups, 'nope')).toBeNull();
  });

  it('builds the address of a group', () => {
    expect(groupPath(groups[0], groups)).toBe('/groups/goa-trip');
  });
});
