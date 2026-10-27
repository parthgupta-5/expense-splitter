// Where auth redirects land, and where the app goes afterwards. Supabase sends every email link and the Google
// sign-in back to /auth/callback (PKCE: a one-time ?code= exchanged in this browser). The page to return to is kept
// in sessionStorage, never in the URL, and is only ever an internal path, so a crafted link cannot redirect off-site.

export const CALLBACK_PATH = '/auth/callback';
export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;
const RETURN_KEY = 'expense-splitter-auth-return';
const MAX_PATH_LENGTH = 300;
const NOT_RETURNABLE = new Set([CALLBACK_PATH, '/reset-password']);
const BASE = 'https://app.invalid';

/** `value` if it is a path inside this app (e.g. "/groups/abc#x"), otherwise "/". Never an absolute or // URL. */
export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > MAX_PATH_LENGTH) return '/';
  // "//host", "/\host" and control characters (browsers drop tabs and newlines) can all lead to another origin.
  if (/^\/[/\\]|\\/.test(value) || Array.from(value).some((char) => char.charCodeAt(0) < 32 || char === '\u007f')) {
    return '/';
  }
  let url;
  try { url = new URL(value, BASE); } catch { return '/'; }
  if (url.origin !== BASE || NOT_RETURNABLE.has(url.pathname)) return '/';
  return url.pathname + url.search + url.hash;
}

const session = () => {
  try { return window.sessionStorage; } catch { return null; }
};

/** Remembers the page to come back to after a redirect sign-in (this tab only). */
export function rememberReturnPath(path) {
  try { session()?.setItem(RETURN_KEY, safeReturnPath(path)); } catch { /* storage unavailable: return to "/" */ }
}

/**
 * The remembered page, or "/". It is read, not removed, so finishing a sign-in twice (a re-render, a reload) still
 * lands in the same place; the next sign-in from this tab overwrites it, and it is checked again on every read.
 */
export function readReturnPath() {
  let value = null;
  try { value = session()?.getItem(RETURN_KEY) ?? null; } catch { /* storage unavailable */ }
  return safeReturnPath(value);
}

/** Only digits, at most OTP_LENGTH of them (so pasting "123 456" works). */
export const normalizeCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH);

const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description', 'sb_flow_id'];
const TOKEN_HASH = /(^|&)(access_token|refresh_token|provider_token|provider_refresh_token)=/;

/**
 * Run once before the router starts. Keeps auth results out of ordinary URLs:
 * - a code or error that Supabase sent to the site root (its fallback when a redirect URL is not allowed) is moved
 *   to /auth/callback, which handles it and then clears it;
 * - tokens in the address-bar fragment (the old implicit flow, which this app no longer uses) are dropped unused;
 * - an error in the fragment is moved to /auth/callback so it can be explained.
 */
export function routeAuthRedirect(location = window.location, history = window.history) {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (TOKEN_HASH.test(location.hash.replace(/^#/, ''))) {
    history.replaceState(history.state, '', location.pathname + location.search);
    return;
  }
  if (hash.has('error')) {
    const moved = new URLSearchParams();
    ['error', 'error_code', 'error_description'].forEach((key) => { if (hash.has(key)) moved.set(key, hash.get(key)); });
    history.replaceState(null, '', CALLBACK_PATH + '?' + moved);
    return;
  }
  const query = new URLSearchParams(location.search);
  if (location.pathname === '/' && (query.has('code') || query.has('error'))) {
    const moved = new URLSearchParams();
    AUTH_PARAMS.forEach((key) => { if (query.has(key)) moved.set(key, query.get(key)); });
    history.replaceState(null, '', CALLBACK_PATH + '?' + moved);
  }
}
