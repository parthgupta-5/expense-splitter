// The delete-account Edge Function's handler (supabase/functions/delete-account/handler.js) with fake Supabase clients:
// who may delete what, in which order, and that nothing is reported as deleted unless the deletion succeeded.
import { describe, expect, it } from 'vitest';
import { REAUTH_SECONDS, createDeleteAccountHandler, lastSignInSeconds } from '../functions/delete-account/handler.js';

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const ME = '00000000-0000-4000-8000-000000000001';
const base64url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// Built at run time: a fake access token whose `amr` claim says when the user last signed in.
const tokenSignedInAt = (seconds) => [base64url({ alg: 'none' }), base64url({ sub: ME, amr: [{ method: 'password', timestamp: seconds }] }), 'sig'].join('.');
const FRESH = tokenSignedInAt(NOW / 1000 - 60);
const STALE = tokenSignedInAt(NOW / 1000 - REAUTH_SECONDS - 60);

function fakeSupabase({
  user = { id: ME }, profile = { username: 'leaving_lee' }, blockers = [], files = ['a.jpg', 'b.jpg'], fail = {},
} = {}) {
  const calls = {
    clients: [], deleted: [], removed: [], listed: [], updated: [], rpc: [],
  };
  let remaining = [...files];
  const createClient = (url, key, options) => {
    calls.clients.push({ key, authorization: options?.global?.headers?.Authorization || null });
    return {
      auth: {
        getUser: async (token) => (token === FRESH || token === STALE
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error('invalid JWT') }),
        admin: {
          deleteUser: async (id) => { calls.deleted.push({ id, key }); return { error: fail.delete ? new Error('db') : null }; },
        },
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: fail.profile ? new Error('x') : null }) }) }),
        update: (values) => ({
          eq: async (column, id) => { calls.updated.push({ values, id, key }); return { error: fail.update ? new Error('x') : null }; },
        }),
      }),
      rpc: async (name) => { calls.rpc.push({ name, key }); return { data: blockers, error: fail.rpc ? new Error('x') : null }; },
      storage: {
        from: (bucket) => ({
          list: async (prefix) => {
            calls.listed.push({ bucket, prefix, key });
            if (fail.list) return { data: null, error: new Error('x') };
            return { data: remaining.map((name) => ({ name })), error: null };
          },
          remove: async (paths) => {
            calls.removed.push({ bucket, paths, key });
            if (fail.remove) return { data: null, error: new Error('x') };
            remaining = [];
            return { data: paths, error: null };
          },
        }),
      },
    };
  };
  return { createClient, calls };
}

const handlerWith = (fake, config = {}) => createDeleteAccountHandler({
  supabaseUrl: 'https://abc.supabase.co', anonKey: 'public-key', adminKey: 'admin-key', createClient: fake.createClient, now: () => NOW, ...config,
});
const post = (body, token = FRESH, extra = {}) => new Request('https://abc.supabase.co/functions/v1/delete-account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://app.example', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
  body: JSON.stringify(body),
});
const call = async (fake, request, config) => {
  const response = await handlerWith(fake, config)(request);
  return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
};

describe('delete-account: success', () => {
  it('deletes only the caller, after removing only their own photos, and says so only then', async () => {
    const fake = fakeSupabase();
    const result = await call(fake, post({ confirm: ' @Leaving_Lee ', userId: 'someone-else' }));
    expect(result).toMatchObject({ status: 200, body: { deleted: true } });
    expect(fake.calls.deleted).toEqual([{ id: ME, key: 'admin-key' }]); // the body cannot name another account
    expect(fake.calls.updated).toEqual([{ values: { avatar_url: null }, id: ME, key: 'public-key' }]);
    expect(fake.calls.removed).toEqual([{ bucket: 'avatars', paths: [`${ME}/a.jpg`, `${ME}/b.jpg`], key: 'public-key' }]);
    expect(fake.calls.listed.every((item) => item.prefix === ME && item.key === 'public-key')).toBe(true);
    expect(fake.calls.rpc).toEqual([{ name: 'account_deletion_blockers', key: 'public-key' }]);
  });

  it('uses the admin key for nothing but checking the token and the one deletion', async () => {
    const fake = fakeSupabase();
    await call(fake, post({ confirm: 'leaving_lee' }));
    const userClients = fake.calls.clients.filter((client) => client.key === 'public-key');
    expect(userClients).toEqual([{ key: 'public-key', authorization: `Bearer ${FRESH}` }]);
    expect(fake.calls.clients.filter((client) => client.key === 'admin-key')).toEqual([{ key: 'admin-key', authorization: null }]);
  });

  it('answers the browser\'s CORS preflight and limits origins when configured', async () => {
    const fake = fakeSupabase();
    const preflight = await call(fake, new Request('https://abc.supabase.co/functions/v1/delete-account', { method: 'OPTIONS' }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/authorization/);
    const limited = await call(fake, post({ confirm: 'leaving_lee' }), { allowedOrigins: 'https://expense.example' });
    expect(limited.headers.get('access-control-allow-origin')).toBe('https://expense.example');
  });
});

describe('delete-account: refusals (nothing is deleted)', () => {
  it('refuses requests without a valid session', async () => {
    for (const request of [post({ confirm: 'leaving_lee' }, null), post({ confirm: 'leaving_lee' }, 'forged.token.value')]) {
      const fake = fakeSupabase();
      expect(await call(fake, request)).toMatchObject({ status: 401, body: { code: 'not_signed_in' } });
      expect(fake.calls.deleted).toEqual([]);
      expect(fake.calls.removed).toEqual([]);
    }
  });

  it('asks for a recent sign-in', async () => {
    const fake = fakeSupabase();
    expect(await call(fake, post({ confirm: 'leaving_lee' }, STALE))).toMatchObject({ status: 403, body: { code: 'reauth_required' } });
    expect(fake.calls.deleted).toEqual([]);
    expect(fake.calls.updated).toEqual([]);
  });

  it('needs the caller\'s own username typed exactly', async () => {
    for (const confirm of ['', 'someone_else', 'DELETE', undefined]) {
      const fake = fakeSupabase();
      expect(await call(fake, post({ confirm })), String(confirm)).toMatchObject({ status: 400, body: { code: 'confirmation_mismatch' } });
      expect(fake.calls.deleted).toEqual([]);
      expect(fake.calls.removed).toEqual([]);
    }
  });

  it('names the shared groups that must be dealt with first', async () => {
    const fake = fakeSupabase({ blockers: [{ group_name: 'Flat' }, { group_name: 'Goa trip' }] });
    expect(await call(fake, post({ confirm: 'leaving_lee' }))).toMatchObject({
      status: 409, body: { code: 'owns_shared_groups', groups: ['Flat', 'Goa trip'] },
    });
    expect(fake.calls.deleted).toEqual([]);
    expect(fake.calls.removed).toEqual([]);
  });

  it('only accepts POST, and refuses when the server is not configured', async () => {
    const fake = fakeSupabase();
    expect((await call(fake, new Request('https://abc.supabase.co/functions/v1/delete-account'))).status).toBe(405);
    expect(await call(fake, post({ confirm: 'leaving_lee' }), { adminKey: '' })).toMatchObject({ status: 500, body: { code: 'not_configured' } });
    expect(fake.calls.deleted).toEqual([]);
  });
});

describe('delete-account: partial failures are reported honestly', () => {
  it('stops before deleting the account when photos cannot be removed', async () => {
    for (const fail of [{ update: true }, { list: true }, { remove: true }, { rpc: true }, { profile: true }]) {
      const fake = fakeSupabase({ fail });
      const result = await call(fake, post({ confirm: 'leaving_lee' }));
      expect(result.status, JSON.stringify(fail)).toBe(500);
      expect(result.body.deleted).toBeUndefined();
      expect(fake.calls.deleted).toEqual([]);
    }
  });

  it('says the account was not deleted when the final step fails', async () => {
    const fake = fakeSupabase({ fail: { delete: true } });
    const result = await call(fake, post({ confirm: 'leaving_lee' }));
    expect(result).toMatchObject({ status: 500, body: { code: 'delete_failed' } });
    expect(result.body.message).toMatch(/could not be deleted/);
    expect(result.body.deleted).toBeUndefined();
  });
});

it('reads the newest sign-in time from the token, and nothing from a malformed one', () => {
  expect(lastSignInSeconds(tokenSignedInAt(1700000000))).toBe(1700000000);
  expect(lastSignInSeconds('not-a-token')).toBeNull();
  expect(lastSignInSeconds([base64url({}), base64url({ sub: ME }), 'x'].join('.'))).toBeNull();
});
