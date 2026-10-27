// @vitest-environment jsdom
// useAuth against a fake Supabase client: the right Supabase Auth calls, redirects to /auth/callback, and the
// password-recovery state that keeps the username dialog away from the new-password page.
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const fake = vi.hoisted(() => {
  const listeners = [];
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn((callback) => {
      listeners.push(callback);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signUp: vi.fn(),
    verifyOtp: vi.fn(),
    resend: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  };
  return { auth, emit: (event, session) => listeners.forEach((listener) => listener(event, session)), listeners };
});

vi.mock('../supabase', () => ({ supabase: { auth: fake.auth }, supabaseConfigured: true }));

const { useAuth } = await import('./useAuth');

const ok = { data: {}, error: null };
const session = { user: { id: 'user-1', email: 'asha@example.com' } };
const CALLBACK = window.location.origin + '/auth/callback';

beforeEach(() => {
  window.sessionStorage.clear();
  fake.listeners.length = 0;
  fake.auth.getSession.mockResolvedValue({ data: { session: null } });
  Object.values(fake.auth).forEach((fn) => { if (!fn.getMockImplementation()) fn.mockResolvedValue(ok); });
});
afterEach(() => vi.clearAllMocks());

const ready = async () => {
  const hook = renderHook(() => useAuth());
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
};

describe('useAuth', () => {
  it('signs up with a confirmation code and sends every email link back to /auth/callback', async () => {
    const { result } = await ready();
    fake.auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    expect(await result.current.signUp({ email: 'a@example.com', password: 'p', displayName: 'Asha' }))
      .toEqual({ needsConfirmation: true });
    expect(fake.auth.signUp).toHaveBeenCalledWith({
      email: 'a@example.com', password: 'p', options: { data: { display_name: 'Asha' }, emailRedirectTo: CALLBACK },
    });

    await result.current.verifySignUpCode({ email: 'a@example.com', code: '123456' });
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@example.com', token: '123456', type: 'email' });
    await result.current.resendSignUpCode('a@example.com');
    expect(fake.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@example.com', options: { emailRedirectTo: CALLBACK } });
    await result.current.sendPasswordReset('a@example.com');
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', { redirectTo: CALLBACK });
    await result.current.signInWithGoogle();
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: CALLBACK } });
  });

  it('passes Supabase Auth errors on unchanged', async () => {
    const { result } = await ready();
    const error = Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' });
    fake.auth.verifyOtp.mockResolvedValue({ data: {}, error });
    await expect(result.current.verifySignUpCode({ email: 'a@example.com', code: '000000' })).rejects.toBe(error);
  });

  it('exchanges a callback code with its flow id and reports a password-reset link', async () => {
    const { result } = await ready();
    fake.auth.exchangeCodeForSession.mockResolvedValue({ data: { session, redirectType: null }, error: null });
    expect(await result.current.exchangeCode({ code: 'c1', flowId: 'f1' })).toEqual({ recovery: false });
    expect(fake.auth.exchangeCodeForSession).toHaveBeenCalledWith('c1', { flowId: 'f1' });
    expect(await result.current.exchangeCode({ code: 'c2' })).toEqual({ recovery: false });
    expect(fake.auth.exchangeCodeForSession).toHaveBeenLastCalledWith('c2', undefined);

    fake.auth.exchangeCodeForSession.mockResolvedValue({ data: { session, redirectType: 'recovery' }, error: null });
    expect(await result.current.exchangeCode({ code: 'c3' })).toEqual({ recovery: true });
  });

  it('keeps the recovery state through a reload until the password is changed or the user signs out', async () => {
    const first = await ready();
    fake.auth.verifyOtp.mockResolvedValue(ok);
    await act(() => first.result.current.verifyRecoveryCode({ email: 'a@example.com', code: '654321' }));
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@example.com', token: '654321', type: 'recovery' });
    expect(first.result.current.recovering).toBe(true);
    first.unmount();

    fake.auth.getSession.mockResolvedValue({ data: { session } }); // the reset page is reloaded
    const second = await ready();
    expect(second.result.current.recovering).toBe(true);
    await act(() => second.result.current.updatePassword('Correct-Horse-9'));
    expect(second.result.current.recovering).toBe(false);
    second.unmount();

    const third = await ready();
    act(() => fake.emit('PASSWORD_RECOVERY', session));
    expect(third.result.current.recovering).toBe(true);
    act(() => fake.emit('SIGNED_OUT', null));
    expect(third.result.current.recovering).toBe(false);
    expect(window.sessionStorage.getItem('expense-splitter-recovering')).toBeNull();
  });

  it('forgets a recovery state left from a session that has ended', async () => {
    window.sessionStorage.setItem('expense-splitter-recovering', '1');
    const { result } = await ready(); // getSession: no session
    expect(result.current.recovering).toBe(false);
  });
});
