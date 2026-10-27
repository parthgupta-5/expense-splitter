// Which profile-photo URLs this app made, and so may show and later delete. A managed photo lives in this project's
// public `avatars` bucket at <user id>/<random v4 uuid>.jpg (the Storage policies and the profiles.avatar_url check in
// 2026103001_avatar_storage.sql enforce the same shape). Anything else, such as a link saved by an older version, is
// never shown and never deleted.

export const AVATAR_BUCKET = 'avatars';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

const newUuid = () => globalThis.crypto.randomUUID();

/** A new, unguessable object path in the user's own folder. */
export const newAvatarPath = (userId) => `${userId}/${newUuid()}.jpg`;

/**
 * The Storage object path ("<userId>/<uuid>.jpg") behind `url` when it is `userId`'s own photo in this project's
 * avatars bucket, otherwise null. Only a path returned from here is ever deleted.
 */
export function ownAvatarPath(url, userId, supabaseUrl) {
  if (typeof url !== 'string' || !url || !supabaseUrl || !UUID_V4.test(String(userId))) return null;
  let parsed;
  let project;
  try {
    parsed = new URL(url);
    project = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== project.origin || parsed.search || parsed.hash) return null;
  if (!parsed.pathname.startsWith(PUBLIC_PREFIX)) return null;
  const parts = parsed.pathname.slice(PUBLIC_PREFIX.length).split('/');
  if (parts.length !== 2 || parts[0] !== userId) return null;
  const file = parts[1];
  if (!file.endsWith('.jpg') || !UUID_V4.test(file.slice(0, -4))) return null;
  return `${userId}/${file}`;
}

/** The photo to show for this profile, or null to show the generated initial. */
export const managedAvatarSrc = (url, userId, supabaseUrl) => (ownAvatarPath(url, userId, supabaseUrl) ? url : null);
