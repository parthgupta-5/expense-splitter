// Turns raw errors (network, Supabase, Postgres) into short messages that are safe to show users.
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  if (/row-level security|permission denied|not authorized|jwt/i.test(message) || error?.code === '42501') {
    return "You don't have permission to do that. Try signing in again.";
  }
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Try signing in.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (!message || /\n\s+at /.test(message) || message.length > 160) return fallback;
  return message;
}
