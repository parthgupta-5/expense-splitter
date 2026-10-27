// Readable group addresses: /groups/goa-trip instead of /groups/<long id>. A slug is made from the group's name and is
// only a label for the address bar: every group is still stored and shared by its id, and /groups/<id> keeps working.
// Slugs are worked out from the groups you can see, so two groups with the same name become goa-trip and goa-trip-2
// (the older one keeps the plain name).

const MAX_SLUG_LENGTH = 40;

/** "Goa Trip 2026!" -> "goa-trip-2026". Names with no Latin letters or digits fall back to "group". */
export function slugify(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'group';
}

/** Map of group id -> unique slug for these groups. The same groups always get the same slugs. */
export function groupSlugs(groups) {
  const ordered = [...groups].sort((a, b) => (
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id))
  ));
  const taken = new Set();
  const slugs = new Map();
  ordered.forEach((group) => {
    const base = slugify(group.name);
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    slugs.set(group.id, slug);
  });
  return slugs;
}

/** The address of a group, e.g. "/groups/goa-trip". */
export const groupPath = (group, groups) => '/groups/' + (groupSlugs(groups).get(group.id) || group.id);

/** The group an address segment refers to: an id (old links) or a slug. */
export function findGroup(groups, segment) {
  const byId = groups.find((group) => group.id === segment);
  if (byId) return byId;
  const slugs = groupSlugs(groups);
  return groups.find((group) => slugs.get(group.id) === segment) || null;
}
