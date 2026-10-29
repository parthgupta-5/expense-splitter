// The purge-deleted-accounts Edge Function's handler with a fake Supabase client: only the scheduled job may call it,
// and each account due for deletion loses its photos first, then the account itself.
import { describe, expect, it } from 'vitest';
import { createPurgeHandler } from '../functions/purge-deleted-accounts/handler.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

function fakeSupabase({ due = [A, B], files = { [A]: ['a.jpg'], [B]: [] }, fail = {} } = {}) {
  const calls = { removed: [], deleted: [], rpc: [] };
  const remaining = Object.fromEntries(Object.entries(files).map(([id, list]) => [id, [...list]]));
  const createClient = () => ({
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return fail.list ? { data: null, error: new Error('x') } : { data: due.map((id) => ({ user_id: id })), error: null };
    },
    storage: {
      from: () => ({
        list: async (prefix) => (fail.photos === prefix
          ? { data: null, error: new Error('x') }
          : { data: (remaining[prefix] || []).map((name) => ({ name })), error: null }),
        remove: async (paths) => {
          calls.removed.push(paths);
          const id = paths[0].split('/')[0];
          remaining[id] = [];
          return { data: paths, error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          if (fail.delete === id) return { error: new Error('blocked') };
          calls.deleted.push(id);
          return { error: null };
        },
      },
    },
  });
  return { createClient, calls };
}

const run = async (fake, { secret = 's3cret', method = 'POST', config = {} } = {}) => {
  const handler = createPurgeHandler({
    supabaseUrl: 'https://abc.supabase.co', adminKey: 'admin-key', cronSecret: 's3cret', createClient: fake.createClient, ...config,
  });
  const headers = secret === null ? {} : { 'x-cron-secret': secret };
  const response = await handler(new Request('https://abc.supabase.co/functions/v1/purge-deleted-accounts', { method, headers }));
  return { status: response.status, body: await response.json() };
};

describe('purge-deleted-accounts', () => {
  it('removes each due account\'s photos, then the account', async () => {
    const fake = fakeSupabase();
    expect(await run(fake)).toEqual({ status: 200, body: { deleted: 2, failed: [] } });
    expect(fake.calls.removed).toEqual([[`${A}/a.jpg`]]);
    expect(fake.calls.deleted).toEqual([A, B]);
  });

  it('keeps going past one failure and reports it', async () => {
    const fake = fakeSupabase({ fail: { photos: A, delete: B } });
    expect(await run(fake)).toEqual({
      status: 200, body: { deleted: 0, failed: [{ user_id: A, step: 'photos' }, { user_id: B, step: 'delete' }] },
    });
    expect(fake.calls.deleted).toEqual([]);
  });

  it('refuses anyone without the secret, other methods, and a missing configuration', async () => {
    for (const secret of [null, '', 'wrong', 's3cret-not']) {
      const fake = fakeSupabase();
      expect((await run(fake, { secret })).status).toBe(401);
      expect(fake.calls.rpc).toEqual([]);
    }
    expect((await run(fakeSupabase(), { method: 'GET' })).status).toBe(405);
    expect((await run(fakeSupabase(), { config: { cronSecret: '' } })).status).toBe(500);
    expect((await run(fakeSupabase({ fail: { list: true } }))).status).toBe(500);
  });
});
