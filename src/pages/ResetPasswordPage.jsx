import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Form, Input, Result,
} from 'antd';
import { useApp } from '../state/AppContext';
import PageIntro from '../components/PageIntro';
import PasswordChecklist from '../components/PasswordChecklist';
import { friendlyError } from '../lib/errors';
import { PASSWORD_MAX_LENGTH, passwordProblem } from '../lib/password';

/**
 * Choose a new password. Reached after a password-reset code (or link) signs the user in; the username dialog waits
 * until this is done. Signed-in users can also use it to change their password.
 */
export default function ResetPasswordPage() {
  const { auth, notify, openAuth } = useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const password = Form.useWatch('password', form) || '';

  if (!auth.user) {
    return (
      <Result
        status="info"
        className="not-found"
        title="Ask for a reset code first"
        subTitle="To choose a new password, ask for a 6-digit code by email and enter it. Codes and links expire after a while."
        extra={<Button type="primary" onClick={() => openAuth('forgot')}>Send a reset code</Button>}
      />
    );
  }

  const submit = async (values) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await auth.updatePassword(values.password);
      notify.success('Password updated');
      navigate('/', { replace: true });
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <PageIntro title="Choose a new password" />
      <section className="page-panel profile-panel">
        <Form form={form} layout="vertical" onFinish={submit} className="profile-form">
          <Form.Item
            name="password"
            label="New password"
            rules={[{
              required: true,
              validator: (_, value) => {
                const problem = value ? passwordProblem(value) : 'Choose a password.';
                return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
              },
            }]}
            extra={<PasswordChecklist value={password} />}
          >
            <Input.Password autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} />
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
            <Input.Password autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>Update password</Button>
        </Form>
      </section>
    </>
  );
}
