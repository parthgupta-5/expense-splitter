import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Button, Divider, Form, Input, Modal, Typography,
} from 'antd';
import { useApp } from '../state/AppContext';
import { supabaseConfigured } from '../supabase';
import { friendlyError } from '../lib/errors';
import { rememberReturnPath } from '../lib/authRedirect';
import { PASSWORD_MAX_LENGTH, passwordProblem } from '../lib/password';
import EmailCodeStep from './EmailCodeStep';
import GoogleButton from './GoogleButton';
import PasswordChecklist from './PasswordChecklist';

const { Text, Paragraph } = Typography;

const TITLES = {
  signup: 'Create your account',
  signin: 'Welcome back',
  forgot: 'Reset your password',
  verify: 'Confirm your email',
  recover: 'Enter your reset code',
};
const NOT_CONFIGURED = 'Accounts are not set up on this copy of the app. Your data stays saved on this device.';

/**
 * Sign up (then confirm the email with a 6-digit code), sign in with a password or Google, and reset a forgotten
 * password with a 6-digit code. Supabase Auth checks every password and code; this only collects and explains.
 */
export default function AuthModal() {
  const {
    auth, notify, authDialog, setAuthMode, closeAuth,
  } = useApp();
  const { open, mode } = authDialog;
  const { pathname, hash } = useLocation();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [codeJustSent, setCodeJustSent] = useState(true);
  const working = useRef(false);
  const password = Form.useWatch('password', form) || '';
  const newPassword = mode === 'signup';

  // Signed in (here, by a code, or in another tab): nothing left to do in this dialog.
  useEffect(() => { if (auth.user && open) closeAuth(); }, [auth.user, open, closeAuth]);

  const switchTo = (next) => { setAuthMode(next); form.resetFields(); };
  const toCodeStep = (next, address, justSent) => { setEmail(address); setCodeJustSent(justSent); setAuthMode(next); };

  /** Runs one auth action at a time, so a double click never sends two emails or two sign-ins. */
  const once = async (action) => {
    if (working.current) return;
    if (!supabaseConfigured) { notify.info(NOT_CONFIGURED); return; }
    working.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (error?.code === 'email_not_confirmed') {
        toCodeStep('verify', form.getFieldValue('email')?.trim() || email, false);
        notify.info('Confirm your email address first: enter the code we emailed you, or send a new one.');
      } else {
        notify.error(friendlyError(error));
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const submit = (values) => once(async () => {
    const address = values.email.trim();
    if (mode === 'signup') {
      const { needsConfirmation } = await auth.signUp({
        email: address, password: values.password, displayName: values.display_name.trim(),
      });
      if (needsConfirmation) toCodeStep('verify', address, true);
      else notify.success('Account created');
    } else if (mode === 'signin') {
      await auth.signIn({ email: address, password: values.password });
      notify.success('Signed in');
    } else {
      await auth.sendPasswordReset(address);
      toCodeStep('recover', address, true);
    }
  });

  const google = async () => {
    if (working.current) return;
    if (!supabaseConfigured) { notify.info(NOT_CONFIGURED); return; }
    working.current = true;
    setGoogleBusy(true);
    rememberReturnPath(pathname + hash);
    try {
      await auth.signInWithGoogle(); // the browser now leaves for Google
    } catch (error) {
      notify.error(friendlyError(error));
      working.current = false;
      setGoogleBusy(false);
    }
  };

  if (mode === 'verify' || mode === 'recover') {
    const signup = mode === 'verify';
    return (
      <Modal title={TITLES[mode]} open={open} onCancel={closeAuth} footer={null} destroyOnHidden className="auth-modal">
        <EmailCodeStep
          key={mode + email}
          email={email}
          sentJustNow={codeJustSent}
          intro={signup ? 'We emailed a 6-digit code to' : 'If this email has an account, we sent a 6-digit code to'}
          submitLabel={signup ? 'Confirm email' : 'Continue'}
          onVerify={async (code) => {
            if (signup) {
              await auth.verifySignUpCode({ email, code });
              notify.success('Email confirmed. You are signed in.');
            } else {
              await auth.verifyRecoveryCode({ email, code });
              notify.success('Code accepted. Choose a new password.');
            }
          }}
          onResend={() => (signup ? auth.resendSignUpCode(email) : auth.sendPasswordReset(email))}
          onChangeEmail={() => switchTo(signup ? 'signup' : 'forgot')}
        />
      </Modal>
    );
  }

  return (
    <Modal title={TITLES[mode]} open={open} onCancel={closeAuth} footer={null} destroyOnHidden className="auth-modal">
      {mode === 'signup' && (
        <Paragraph type="secondary">
          An account keeps your groups in the cloud, syncs them across devices and lets you share a group with friends.
        </Paragraph>
      )}
      {mode !== 'forgot' && (
        <>
          <GoogleButton onClick={google} loading={googleBusy} disabled={busy} />
          <Divider plain className="auth-divider">or use your email</Divider>
        </>
      )}
      <Form form={form} layout="vertical" onFinish={submit} preserve={false} initialValues={{ email }}>
        {mode === 'signup' && (
          <Form.Item name="display_name" label="Your name" rules={[{ required: true, whitespace: true, message: 'Add your name' }]}>
            <Input autoComplete="name" placeholder="Alex Morgan" maxLength={80} />
          </Form.Item>
        )}
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email address' }]}>
          <Input autoComplete="email" inputMode="email" placeholder="you@example.com" />
        </Form.Item>
        {mode !== 'forgot' && (
          <Form.Item
            name="password"
            label="Password"
            rules={newPassword
              ? [{
                required: true,
                validator: (_, value) => {
                  const problem = value ? passwordProblem(value) : 'Choose a password.';
                  return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
                },
              }]
              : [{ required: true, message: 'Enter your password.' }]}
            extra={newPassword ? <PasswordChecklist value={password} /> : undefined}
          >
            <Input.Password
              autoComplete={newPassword ? 'new-password' : 'current-password'}
              maxLength={newPassword ? PASSWORD_MAX_LENGTH : undefined}
            />
          </Form.Item>
        )}
        {mode === 'forgot' && (
          <Paragraph type="secondary">We will email you a 6-digit code to choose a new password.</Paragraph>
        )}
        {mode === 'signup' && (
          <Paragraph type="secondary" className="auth-legal">
            By creating an account you agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and confirm you have read the{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </Paragraph>
        )}
        <Button type="primary" block htmlType="submit" loading={busy} disabled={googleBusy}>
          {{ signup: 'Create account', signin: 'Sign in', forgot: 'Send code' }[mode]}
        </Button>
        <div className="auth-switch">
          {mode === 'signup' && (
            <>
              <Text type="secondary">Already have an account?</Text>
              <Button type="link" onClick={() => switchTo('signin')}>Sign in</Button>
            </>
          )}
          {mode === 'signin' && (
            <>
              <Button type="link" onClick={() => switchTo('forgot')}>Forgot password?</Button>
              <Text type="secondary">·</Text>
              <Button type="link" onClick={() => switchTo('signup')}>Create account</Button>
            </>
          )}
          {mode === 'forgot' && <Button type="link" onClick={() => switchTo('signin')}>Back to sign in</Button>}
        </div>
      </Form>
    </Modal>
  );
}
