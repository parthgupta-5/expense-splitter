import React, { useState } from 'react';
import { Button, Form, Input, Modal, Typography } from 'antd';
import { useApp } from '../state/AppContext';
import { supabaseConfigured } from '../supabase';
import { friendlyError } from '../lib/errors';

const { Text, Paragraph } = Typography;

const TITLES = { signup: 'Create your account', signin: 'Welcome back', forgot: 'Reset your password' };

export default function AuthModal() {
  const { auth, notify, authDialog, setAuthMode, closeAuth } = useApp();
  const { open, mode } = authDialog;
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const switchTo = (next) => { setAuthMode(next); form.resetFields(); };

  const submit = async (values) => {
    if (!supabaseConfigured) {
      notify.info('Accounts are not set up on this copy of the app. Your data stays saved on this device.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp({
          email: values.email, password: values.password, displayName: values.display_name.trim(),
        });
        notify.success(needsConfirmation ? 'Check your email to confirm your account, then sign in.' : 'Account created');
        if (needsConfirmation) { switchTo('signin'); return; }
      } else if (mode === 'signin') {
        await auth.signIn({ email: values.email, password: values.password });
        notify.success('Signed in');
      } else {
        await auth.sendPasswordReset(values.email);
        notify.success('If that email has an account, a reset link is on its way.');
      }
      closeAuth();
      form.resetFields();
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={TITLES[mode]} open={open} onCancel={closeAuth} footer={null} destroyOnHidden className="auth-modal">
      {mode === 'signup' && (
        <Paragraph type="secondary">
          An account keeps your groups in the cloud, syncs them across devices and lets you share a group with friends.
        </Paragraph>
      )}
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        {mode === 'signup' && (
          <Form.Item name="display_name" label="Your name" rules={[{ required: true, whitespace: true }]}>
            <Input autoComplete="name" placeholder="Alex Morgan" maxLength={80} />
          </Form.Item>
        )}
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="email" placeholder="you@example.com" />
        </Form.Item>
        {mode !== 'forgot' && (
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}
          >
            <Input.Password
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="At least 8 characters"
            />
          </Form.Item>
        )}
        <Button type="primary" block htmlType="submit" loading={busy}>
          {{ signup: 'Create account', signin: 'Sign in', forgot: 'Send reset link' }[mode]}
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
