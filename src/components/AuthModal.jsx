import React, { useState } from 'react';
import { Button, Form, Input, Modal, Typography } from 'antd';
import { supabase } from '../supabase';
import { friendlyError } from '../lib/errors';

const { Text } = Typography;

export default function AuthModal({ open, mode, onModeChange, onClose, messageApi }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (values) => {
    if (!supabase) {
      messageApi.info('Cloud login is ready to activate when the Supabase project is connected. '
        + 'Data remains saved on this device.');
      return;
    }
    setBusy(true);
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { data: { display_name: values.display_name } },
        });
        if (error) throw error;
        messageApi.success(data.session ? 'Account created' : 'Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
        if (error) throw error;
        messageApi.success('Signed in');
      }
      onClose(true);
      form.resetFields();
    } catch (error) {
      messageApi.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={signup ? 'Create your account' : 'Welcome back'}
      open={open}
      onCancel={() => onClose(false)}
      footer={null}
      destroyOnHidden
      className="auth-modal"
    >
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        {signup && (
          <Form.Item name="display_name" label="Your name" rules={[{ required: true, whitespace: true }]}>
            <Input autoComplete="name" placeholder="Alex Morgan" maxLength={80} />
          </Form.Item>
        )}
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="email" placeholder="you@example.com" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}
        >
          <Input.Password
            autoComplete={signup ? 'new-password' : 'current-password'}
            placeholder="At least 8 characters"
          />
        </Form.Item>
        <Button type="primary" block htmlType="submit" loading={busy}>
          {signup ? 'Create account' : 'Sign in'}
        </Button>
        <div className="auth-switch">
          <Text type="secondary">{signup ? 'Already have an account?' : 'Have an account?'}</Text>
          <Button type="link" onClick={() => { onModeChange(signup ? 'signin' : 'signup'); form.resetFields(); }}>
            {signup ? 'Sign in' : 'Create account'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
