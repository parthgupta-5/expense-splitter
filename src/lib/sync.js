// Pure merge of local groups with the groups loaded from the cloud on sign-in.
const time = (value) => {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * @param local     groups on this device
 * @param cloud     groups loaded for the signed-in user
 * @param meta      { userId, groups: { [id]: updatedAt at last successful sync } } from this device
 * @param userId    the signed-in user
 * @param isNewAccount  true when a different account used this device: local data is ignored
 * @returns { groups, replacedLocal: names, droppedLocal: names }
 */
export function mergeGroups({ local, cloud, meta = {}, userId, isNewAccount = false }) {
  if (isNewAccount) return { groups: [...cloud], replacedLocal: [], droppedLocal: [] };
  const synced = meta.userId === userId ? meta.groups || {} : {};
  const cloudById = new Map(cloud.map((group) => [group.id, group]));
  const localById = new Map(local.map((group) => [group.id, group]));
  const groups = [];
  const replacedLocal = [];
  const droppedLocal = [];

  cloud.forEach((remote) => {
    const mine = localById.get(remote.id);
    if (!mine) { groups.push(remote); return; }
    if (time(mine.updatedAt) > time(remote.updatedAt)) { groups.push(mine); return; }
    const editedSinceSync = synced[mine.id] !== mine.updatedAt;
    if (editedSinceSync && time(mine.updatedAt) < time(remote.updatedAt) && JSON.stringify(strip(mine)) !== JSON.stringify(strip(remote))) {
      replacedLocal.push(mine.name);
    }
    groups.push(remote);
  });

  local.forEach((mine) => {
    if (cloudById.has(mine.id)) return;
    const wasSynced = mine.id in synced;
    const editedSinceSync = synced[mine.id] !== mine.updatedAt;
    if (wasSynced && !editedSinceSync) droppedLocal.push(mine.name); // deleted on another device
    else groups.push(mine); // brand-new, or edited after the other device deleted it: keep and re-upload
  });
  return { groups, replacedLocal, droppedLocal };
}

const strip = ({ name, people, expenses, payments, savedSplits }) => ({ name, people, expenses, payments, savedSplits });
