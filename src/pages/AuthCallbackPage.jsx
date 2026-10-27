import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Result, Spin } from 'antd';
import { useApp } from '../state/AppContext';
import { supabaseConfigured } from '../supabase';
import { friendlyError } from '../lib/errors';
import { CALLBACK_PATH, readReturnPath } from '../lib/authRedirect';

// One exchange per code, even if the page mounts twice (a code works only once).
const exchanges = new Map();

/** The auth result in the address bar when the page opened, read once; the bar is cleared right after. */
function readCallback() {
  const query = new URLSearchParams(window.location.search);
  return {
    code: query.get('code'),
    flowId: query.get('sb_flow_id'),
    error: query.get('error'),
    errorCode: query.get('error_code'),
  };
}

function callbackErrorMessage({ error, errorCode }) {
  if (error === 'access_denied' && !errorCode) return 'Google sign-in was cancelled. Nothing was changed.';
  if (errorCode === 'otp_expired') return 'This link has expired or was already used. Ask for a new email, or use the 6-digit code.';
  return friendlyError({ code: errorCode }, 'Sign-in could not be completed. Please try again.');
}

/**
 * Where Supabase sends the browser back after Google sign-in or an email link (PKCE). It exchanges the one-time
 * code for a session, removes everything from the address bar first, then returns to the page the user came from
 * (an internal path only) or, after a password-reset link, to the new-password page.
 */
export default function AuthCallbackPage() {
  const { auth, openAuth } = useApp();
  const navigate = useNavigate();
  const [callback] = useState(readCallback);
  const [problem, setProblem] = useState(() => {
    if (callback.error) return callbackErrorMessage(callback);
    if (callback.code && !supabaseConfigured) return 'Accounts are not set up on this copy of the app.';
    return null;
  });

  // Clear the code or error from the address bar and history before doing anything with it.
  useEffect(() => {
    if (window.location.search || window.location.hash) navigate(CALLBACK_PATH, { replace: true });
  }, [navigate]);

  const { exchangeCode, ready, user } = auth;
  useEffect(() => {
    if (problem) return undefined;
    if (!callback.code) {
      // Nothing to finish (opened directly, reloaded, or already done): go on once the session is known.
      if (ready) navigate(user ? readReturnPath() : '/', { replace: true });
      return undefined;
    }
    let active = true;
    if (!exchanges.has(callback.code)) exchanges.set(callback.code, exchangeCode(callback));
    exchanges.get(callback.code)
      .then(({ recovery }) => {
        if (active) navigate(recovery ? '/reset-password' : readReturnPath(), { replace: true });
      })
      .catch((error) => { if (active) setProblem(friendlyError(error, 'Sign-in could not be completed. Please try again.')); });
    return () => { active = false; };
  }, [callback, problem, ready, user, exchangeCode, navigate]);

  if (!problem) {
    return (
      <div className="auth-callback" role="status" aria-live="polite">
        <Spin />
        <span>Finishing sign-in…</span>
      </div>
    );
  }

  return (
    <div role="alert">
      <Result
        status="warning"
        className="not-found"
        title={user ? 'You are already signed in' : 'Sign-in did not finish'}
        subTitle={problem}
        extra={user
          ? <Button type="primary" onClick={() => navigate(readReturnPath(), { replace: true })}>Continue</Button>
          : [
            <Button key="again" type="primary" onClick={() => { navigate('/', { replace: true }); openAuth('signin'); }}>
              Try again
            </Button>,
            <Button key="guest" onClick={() => navigate('/', { replace: true })}>Continue without an account</Button>,
          ]}
      />
    </div>
  );
}
