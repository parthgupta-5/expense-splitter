import { createClient } from '@supabase/supabase-js';

/**
 * The Supabase client expects the bare project URL (https://<ref>.supabase.co). A URL copied with the REST
 * path (".../rest/v1/") makes every auth request go to ".../rest/v1/auth/v1" and fail, so it is trimmed here.
 */
export function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return '';
  }
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabaseConfigured = Boolean(url && anonKey);
// PKCE: redirects bring back a one-time code, never tokens. The /auth/callback page exchanges it explicitly (and
// clears it from the address bar), so the client does not read sessions from arbitrary URLs.
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
    auth: {
      flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    },
  })
  : null;
