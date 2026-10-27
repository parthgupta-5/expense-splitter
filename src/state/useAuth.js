import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

const redirectTo = (path = '/') => (typeof window === 'undefined' ? undefined : window.location.origin + path);

/** Supabase session state plus the auth actions the UI needs. Without Supabase the app stays in guest mode. */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!supabase);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const signUp = useCallback(async ({ email, password, displayName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectTo('/') },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo('/reset-password') });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, []);

  const updateDisplayName = useCallback(async (displayName) => {
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setUser(null);
  }, []);

  return {
    user, ready, recovering, signUp, signIn, signOut, sendPasswordReset, updatePassword, updateDisplayName,
  };
}
