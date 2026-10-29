// The delete-account Edge Function's handler (supabase/functions/delete-account/handler.js) with fake Supabase clients:
// who may schedule what, in which order, and that nothing is reported as scheduled unless it was.
import { describe, expect, it } from 'vitest';
import { REAUTH_SECONDS, createDeleteAccountHandler, lastSignInSeconds } from '../functions/delete-account/handler.js';

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const ME = '00000000-0000-4000-8000-000000000001';
const DELETES_ON = '2026-11-08T12:00:00.000Z';
const base64url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// Built at run time: a fake access token whose `amr` claim says when the user last signed in.
const tokenSignedInAt = (seconds) => [base64url({ alg: 'none' }), base64url({ sub: ME, amr: [{ method: 'password', timestamp: seconds }] }), 'sig'].join('.');
const FRESH = tokenSignedInAt(NOW / 1000 - 60);
const STALE = tokenSignedInAt(NOW / 1000 - REAUTH_SECONDS - 60);

function fakeSupabase({
  user = { id: ME }, profile = { username: 'leaving_lee' }, blockers = [],
  scheduled = { deletion_requested_at: '2026-11-01T12:00:00.000Z', deletes_on: DELETES_ON }, fail = {},
} = {}) {
  const calls = {
    clients: [], rpc: [], signedOut: [], deleted: [],
  };
  const createClient = (url, key, options) => {
    calls.clients.push({ key, authorization: options?.global?.headers?.Authorization || null });
    return {
      auth: {
        getUser: async (token) => (token === FRESH || token === STALE
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error('invalid JWT') }),
        admin: {
          deleteUser: async (id) => { calls.deleted.push(id); return { error: null }; },
          signOut: async (token, scope) => {
            calls.signedOut.push({ token, scope, key });
            if (fail.signOut) throw new Error('auth down');
            return { error: null };
          },
        },
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: fail.profile ? new Error('x') : null }) }) }),
      }),
      rpc: async (name, args) => {
        calls.rpc.push({ name, args, key });
        if (name === 'account_deletion_blockers') return { data: blockers, error: fail.blockers ? new Error('x') : null };
        if (name === 'schedule_account_deletion') return { data: fail.schedule ? null : scheduled, error: fail.schedule ? new Error('x') : null };
        return { data: null, error: new Error('unknown function') };
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
const scheduledCalls = (fake) => fake.calls.rpc.filter((item) => item.name === 'schedule_account_deletion');

describe('delete-account: success', () => {
  it('schedules only the caller, signs them out everywhere, and deletes nothing yet', async () => {
    const fake = fakeSupabase();
    const result = await call(fake, post({ confirm: ' @Leaving_Lee ', userId: 'someone-else' }));
    expect(result).toMatchObject({ status: 200, body: { scheduled: true, deletes_on: DELETES_ON } });
    expect(scheduledCalls(fake)).toEqual([{ name: 'schedule_account_deletion', args: { target_user: ME }, key: 'admin-key' }]);
    expect(fake.calls.rpc[0]).toEqual({ name: 'account_deletion_blockers', args: undefined, key: 'public-key' });
    expect(fake.calls.signedOut).toEqual([{ token: FRESH, scope: 'global', key: 'admin-key' }]);
    expect(fake.calls.deleted).toEqual([]);
  });

  it('still reports success when signing out other devices fails', async () => {
    const fake = fakeSupabase({ fail: { signOut: true } });
    expect(await call(fake, post({ confirm: 'leaving_lee' }))).toMatchObject({ status: 200, body: { scheduled: true } });
  });

  it('acts as the caller for every read, with the admin key only for the token, scheduling and signing out', async () => {
    const fake = fakeSupabase();
    await call(fake, post({ confirm: 'leaving_lee' }));
    expect(fake.calls.clients.filter((client) => client.key === 'public-key'))
      .toEqual([{ key: 'public-key', authorization: `Bearer ${FRESH}` }]);
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

describe('delete-account: refusals (nothing is scheduled)', () => {
  it('refuses requests without a valid session', async () => {
    for (const request of [post({ confirm: 'leaving_lee' }, null), post({ confirm: 'leaving_lee' }, 'forged.token.value')]) {
      const fake = fakeSupabase();
      expect(await call(fake, request)).toMatchObject({ status: 401, body: { code: 'not_signed_in' } });
      expect(scheduledCalls(fake)).toEqual([]);
    }
  });

  it('asks for a recent sign-in', async () => {
    const fake = fakeSupabase();
    expect(await call(fake, post({ confirm: 'leaving_lee' }, STALE))).toMatchObject({ status: 403, body: { code: 'reauth_required' } });
    expect(scheduledCalls(fake)).toEqual([]);
  });

  it('needs the caller\'s own username typed exactly', async () => {
    for (const confirm of ['', 'someone_else', 'DELETE', undefined]) {
      const fake = fakeSupabase();
      expect(await call(fake, post({ confirm })), String(confirm)).toMatchObject({ status: 400, body: { code: 'confirmation_mismatch' } });
      expect(scheduledCalls(fake)).toEqual([]);
    }
  });

  it('names the shared groups that must be dealt with first, from either check', async () => {
    const fake = fakeSupabase({ blockers: [{ group_name: 'Flat' }, { group_name: 'Goa trip' }] });
    expect(await call(fake, post({ confirm: 'leaving_lee' }))).toMatchObject({
      status: 409, body: { code: 'owns_shared_groups', groups: ['Flat', 'Goa trip'] },
    });
    expect(scheduledCalls(fake)).toEqual([]);
    // A group became shared between the two checks: the database refuses, and says which.
    const raced = fakeSupabase({ scheduled: { error: 'owns_shared_groups', groups: 'Flat, Goa trip' } });
    expect(await call(raced, post({ confirm: 'leaving_lee' }))).toMatchObject({
      status: 409, body: { code: 'owns_shared_groups', groups: ['Flat', 'Goa trip'] },
    });
    expect(raced.calls.signedOut).toEqual([]);
  });

  it('only accepts POST, and refuses when the server is not configured', async () => {
    const fake = fakeSupabase();
    expect((await call(fake, new Request('https://abc.supabase.co/functions/v1/delete-account'))).status).toBe(405);
    expect(await call(fake, post({ confirm: 'leaving_lee' }), { adminKey: '' })).toMatchObject({ status: 500, body: { code: 'not_configured' } });
    expect(scheduledCalls(fake)).toEqual([]);
  });
});

describe('delete-account: failures are reported honestly', () => {
  it('reports nothing as scheduled when a step fails', async () => {
    for (const fail of [{ blockers: true }, { profile: true }, { schedule: true }]) {
      const fake = fakeSupabase({ fail });
      const result = await call(fake, post({ confirm: 'leaving_lee' }));
      expect(result.status, JSON.stringify(fail)).toBe(500);
      expect(result.body.scheduled).toBeUndefined();
      expect(fake.calls.signedOut).toEqual([]);
    }
  });
});

it('reads the newest sign-in time from the token, and nothing from a malformed one', () => {
  expect(lastSignInSeconds(tokenSignedInAt(1700000000))).toBe(1700000000);
  expect(lastSignInSeconds('not-a-token')).toBeNull();
  expect(lastSignInSeconds([base64url({}), base64url({ sub: ME }), 'x'].join('.'))).toBeNull();
});
