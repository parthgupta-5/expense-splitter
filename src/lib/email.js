/**
 * An email address with most of the part before the @ hidden ("asha@example.com" -> "a•••@example.com"), for showing
 * the signed-in user which address their account uses without spelling it out on screen.
 */
export function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return value ? '•••' : '';
  return Array.from(value.slice(0, at))[0] + '•••' + value.slice(at);
}
