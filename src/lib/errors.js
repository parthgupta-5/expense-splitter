// Supabase Auth error codes (error.code) the sign-in screens can run into.
const AUTH_ERRORS = {
  otp_expired: 'That code is wrong or has expired. Check it, or send a new code.',
  email_not_confirmed: 'Confirm your email address first: enter the code we emailed you.',
  weak_password: 'Choose a stronger password. Very common or leaked passwords are not accepted.',
  same_password: 'Choose a password different from your current one.',
  over_email_send_rate_limit: 'Too many emails were sent. Wait a minute before asking for another code.',
  email_address_invalid: 'Use a valid email address.',
  signup_disabled: 'New accounts cannot be created right now.',
  email_provider_disabled: 'Email sign-in is turned off right now.',
  flow_state_expired: 'This sign-in link has expired. Please start again.',
  flow_state_not_found: 'This sign-in link has expired or was already used. Please start again.',
  bad_code_verifier: 'This sign-in link has expired or was already used. Please start again.',
  bad_oauth_state: 'Sign-in could not be completed. Please start again.',
  bad_oauth_callback: 'Sign-in could not be completed. Please start again.',
};

// Turns raw errors (network, Supabase, Postgres) into short messages that are safe to show users.
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || '');
  if (AUTH_ERRORS[error?.code]) return AUTH_ERRORS[error.code];
  if (error?.name === 'AuthPKCECodeVerifierMissingError') {
    return 'Open the link in the same browser where you asked for it, or enter the 6-digit code from the email.';
  }
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google sign-in is not set up yet.';
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
