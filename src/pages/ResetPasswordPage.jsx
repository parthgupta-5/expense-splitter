import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Form, Input, Result,
} from 'antd';
import { useApp } from '../state/AppContext';
import PageIntro from '../components/PageIntro';
import { friendlyError } from '../lib/errors';

/** Landing page for the password-reset email link (Supabase signs the user in from the link first). */
export default function ResetPasswordPage() {
  const { auth, notify, openAuth } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!auth.user) {
    return (
      <Result
        status="info"
        className="not-found"
        title="Open the link from your email"
        subTitle="This page works from the password-reset link we email you. The link may have expired."
        extra={<Button type="primary" onClick={() => openAuth('forgot')}>Send a new link</Button>}
      />
    );
  }

  const submit = async ({ password }) => {
    setBusy(true);
    try {
      await auth.updatePassword(password);
      notify.success('Password updated');
      navigate('/');
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageIntro title="Choose a new password" />
      <section className="page-panel profile-panel">
        <Form layout="vertical" onFinish={submit} className="profile-form">
          <Form.Item name="password" label="New password" rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Repeat new password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Repeat the password' },
              ({ getFieldValue }) => ({
                validator: (_, value) => (!value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('The passwords do not match'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>Update password</Button>
        </Form>
      </section>
    </>
  );
}
