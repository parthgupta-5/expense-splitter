// The delete-account Edge Function's logic, kept free of Deno APIs so it can be unit-tested in Node
// (supabase/tests/deleteAccountFunction.test.js). index.ts wires it to Deno.serve and the function's environment.
//
// Order, and why:
// 1. Who is asking comes only from the caller's access token, checked by Supabase Auth. Nothing in the request body can
//    name another account.
// 2. The sign-in behind that token must be recent (REAUTH_SECONDS), so an old session left open on a shared device
//    cannot delete the account.
// 3. The caller must type their own @username.
// 4. Groups other members use block the deletion (the database trigger refuses too, atomically).
// 5. Only then is the admin key used: schedule_account_deletion() disables the account at once (it can no longer be
//    found, invited or befriended, and what waited on it is withdrawn), and every session is signed out.
// 6. Nothing is deleted yet. The account can be restored for 7 days by signing in. After that the
//    purge-deleted-accounts function removes its photos and deletes the user, and the database trigger
//    prepare_account_deletion() removes or unlinks everything else in the same transaction.
// Success is reported only after step 5 succeeds.

export const REAUTH_SECONDS = 15 * 60;

const normalizeUsername = (value) => String(value ?? '').trim().replace(/^@/, '').toLowerCase();

/** The newest sign-in time (seconds) recorded in an access token's `amr` claim, or null. */
export function lastSignInSeconds(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    const times = (Array.isArray(claims.amr) ? claims.amr : [])
      .map((entry) => Number(entry?.timestamp)).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

const corsHeaders = (origin, allowed) => {
  const list = String(allowed || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': list.length ? (list.includes(origin) ? origin : list[0]) : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

/**
 * @param config.supabaseUrl, config.anonKey, config.adminKey  from the function's environment (never the browser)
 * @param config.createClient  supabase-js createClient
 * @param config.allowedOrigins  optional comma-separated list of app origins for CORS
 * @param config.now  milliseconds clock (tests)
 */
export function createDeleteAccountHandler({
  supabaseUrl, anonKey, adminKey, createClient, allowedOrigins = '', now = () => Date.now(),
}) {
  return async function handle(request) {
    const cors = corsHeaders(request.headers.get('origin') || '', allowedOrigins);
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });
    const refuse = (status, code, message, extra = {}) => reply(status, { code, message, ...extra });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return refuse(405, 'method_not_allowed', 'Use POST.');
    if (!supabaseUrl || !anonKey || !adminKey) {
      return refuse(500, 'not_configured', 'Account deletion is not set up on the server yet. Nothing was deleted.');
    }

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return refuse(401, 'not_signed_in', 'Sign in first. Nothing was deleted.');
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const admin = createClient(supabaseUrl, adminKey, options);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (authError || !user?.id) return refuse(401, 'not_signed_in', 'Your session has ended. Sign in again. Nothing was deleted.');

    const signedInAt = lastSignInSeconds(token) ?? (Date.parse(user.last_sign_in_at || '') / 1000 || 0);
    if (now() / 1000 - signedInAt > REAUTH_SECONDS) {
      return refuse(403, 'reauth_required', 'For your safety, confirm it is you by signing in again, then retry.');
    }

    let body = {};
    try { body = await request.json(); } catch { /* treated as no confirmation */ }
    // Everything below acts as the caller (their token, Row Level Security and Storage policies apply).
    const asUser = createClient(supabaseUrl, anonKey, {
      ...options, global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: profile, error: profileError } = await asUser.from('profiles').select('username').eq('id', user.id).maybeSingle();
    if (profileError) return refuse(500, 'profile_unavailable', 'Your profile could not be read. Nothing was deleted.');
    if (!profile?.username || normalizeUsername(body?.confirm) !== profile.username) {
      return refuse(400, 'confirmation_mismatch', 'Type your username exactly to confirm. Nothing was deleted.');
    }

    const { data: blockers, error: blockersError } = await asUser.rpc('account_deletion_blockers');
    if (blockersError) return refuse(500, 'check_failed', 'Your groups could not be checked. Nothing was deleted.');
    if (blockers?.length) {
      return refuse(409, 'owns_shared_groups', 'You own groups that other members use. Delete those groups first.', {
        groups: blockers.map((group) => group.group_name),
      });
    }

    // Disable the account now; purge-deleted-accounts removes it (and its photos) once the 7 days are over.
    const { data: scheduled, error: scheduleError } = await admin.rpc('schedule_account_deletion', { target_user: user.id });
    if (scheduleError || !scheduled || scheduled.error === 'not_found') {
      return refuse(500, 'delete_failed', 'Your account could not be scheduled for deletion. Nothing was changed. Please try again.');
    }
    if (scheduled.error === 'owns_shared_groups') {
      return refuse(409, 'owns_shared_groups', 'You own groups that other members use. Delete those groups first.', {
        groups: String(scheduled.groups || '').split(', ').filter(Boolean),
      });
    }
    // Sign the account out everywhere, so it stops working on other devices straight away. Not fatal: the app also
    // locks itself while the account waits to be deleted.
    try { await admin.auth.admin.signOut(token, 'global'); } catch { /* the sessions still end when they expire */ }
    return reply(200, { scheduled: true, deletes_on: scheduled.deletes_on });
  };
}
