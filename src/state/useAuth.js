import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { supabase } from '../supabase';
import { CALLBACK_PATH } from '../lib/authRedirect';

const callbackUrl = () => (typeof window === 'undefined' ? undefined : window.location.origin + CALLBACK_PATH);

// Survives a reload of the reset page, so the username dialog never covers it (this tab only).
const RECOVERY_KEY = 'expense-splitter-recovering';
const readRecovering = () => {
  try { return window.sessionStorage.getItem(RECOVERY_KEY) === '1'; } catch { return false; }
};
const writeRecovering = (on) => {
  try {
    if (on) window.sessionStorage.setItem(RECOVERY_KEY, '1'); else window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch { /* storage unavailable */ }
};

/**
 * Supabase session state plus the auth actions the UI needs. Without Supabase the app stays in guest mode.
 * Passwords, codes and sessions are handled only by Supabase Auth; nothing here stores or logs them.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!supabase);
  const [recovering, setRecoveringState] = useState(() => Boolean(supabase) && readRecovering());
  const recoveryEvent = useRef(false);

  const setRecovering = useCallback((on) => { writeRecovering(on); setRecoveringState(on); }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      if (!data.session) setRecovering(false);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') { recoveryEvent.current = true; setRecovering(true); }
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [setRecovering]);

  const signUp = useCallback(async ({ email, password, displayName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: callbackUrl() },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  /** Confirms a new account with the 6-digit code from its email, which signs it in. */
  const verifySignUpCode = useCallback(async ({ email, code }) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
  }, []);

  const resendSignUpCode = useCallback(async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackUrl() } });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  /** Leaves the app for Google; Supabase brings the browser back to /auth/callback. */
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } });
    if (error) throw error;
  }, []);

  /** Exchanges the one-time code from /auth/callback. `recovery` is true for a password-reset link. */
  const exchangeCode = useCallback(async ({ code, flowId }) => {
    recoveryEvent.current = false;
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) throw error;
    return { recovery: data?.redirectType === 'recovery' || recoveryEvent.current };
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl() });
    if (error) throw error;
  }, []);

  /** Signs in with the 6-digit code from a password-reset email; the app then asks for a new password. */
  const verifyRecoveryCode = useCallback(async ({ email, code }) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (error) throw error;
    setRecovering(true);
  }, [setRecovering]);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, [setRecovering]);

  const updateDisplayName = useCallback(async (displayName) => {
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setRecovering(false);
    setUser(null);
  }, [setRecovering]);

  /** After the account was deleted on the server: forgets the session in this browser only (it no longer exists). */
  const forgetSession = useCallback(async () => {
    if (supabase) {
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
    }
    setRecovering(false);
    setUser(null);
  }, [setRecovering]);

  return {
    user,
    ready,
    recovering,
    forgetSession,
    signUp,
    verifySignUpCode,
    resendSignUpCode,
    signIn,
    signInWithGoogle,
    exchangeCode,
    signOut,
    sendPasswordReset,
    verifyRecoveryCode,
    updatePassword,
    updateDisplayName,
  };
}
