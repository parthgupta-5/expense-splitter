// The purge-deleted-accounts Edge Function's logic, kept free of Deno APIs so it can be unit-tested in Node
// (supabase/tests/purgeDeletedAccountsFunction.test.js). index.ts wires it to Deno.serve and the environment.
//
// Run once a day by a scheduled job (README, "Account deletion"). It is not for browsers: the request must carry the
// CRON_SECRET in an x-cron-secret header. For every account whose 7-day restore window has ended
// (accounts_due_for_deletion()), it deletes the account's profile photos and then the auth user; the database trigger
// prepare_account_deletion() removes or unlinks everything else in that same transaction. One failure does not stop
// the others; it is reported and retried on the next run.

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_PAGES = 20;

/** Compares two strings in time that does not depend on where they first differ. */
function sameSecret(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * @param config.supabaseUrl, config.adminKey  from the function's environment
 * @param config.cronSecret  the shared secret the scheduled job sends (required; without it every request is refused)
 * @param config.createClient  supabase-js createClient
 */
export function createPurgeHandler({
  supabaseUrl, adminKey, cronSecret, createClient,
}) {
  return async function handle(request) {
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });
    if (!supabaseUrl || !adminKey || !cronSecret) return reply(500, { code: 'not_configured' });
    if (!sameSecret(request.headers.get('x-cron-secret'), cronSecret)) return reply(401, { code: 'not_allowed' });

    const admin = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: due, error: dueError } = await admin.rpc('accounts_due_for_deletion', { max_rows: 100 });
    if (dueError) return reply(500, { code: 'list_failed' });

    const deleted = [];
    const failed = [];
    for (const { user_id: userId } of due || []) {
      const bucket = admin.storage.from(AVATAR_BUCKET);
      let photosGone = false;
      for (let page = 0; page < MAX_AVATAR_PAGES; page += 1) {
        const { data: files, error: listError } = await bucket.list(userId, { limit: 100 });
        if (listError) break;
        if (!files?.length) { photosGone = true; break; }
        const { error: removeError } = await bucket.remove(files.map((file) => `${userId}/${file.name}`));
        if (removeError) break;
      }
      if (!photosGone) { failed.push({ user_id: userId, step: 'photos' }); continue; }
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) { failed.push({ user_id: userId, step: 'delete' }); continue; }
      deleted.push(userId);
    }
    return reply(200, { deleted: deleted.length, failed });
  };
}
