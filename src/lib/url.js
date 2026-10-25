/** Only absolute https: URLs are accepted for user-supplied images. */
export function isHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
