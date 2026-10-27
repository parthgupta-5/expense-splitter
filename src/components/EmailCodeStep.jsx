import React, { useEffect, useRef, useState } from 'react';
import {
  Button, Form, Input, Typography,
} from 'antd';
import { friendlyError } from '../lib/errors';
import { OTP_LENGTH, RESEND_SECONDS, normalizeCode } from '../lib/authRedirect';

const { Paragraph, Text } = Typography;

/** Seconds left until `until` (a timestamp), updated every second; 0 once it has passed. */
const secondsUntil = (until) => Math.max(0, Math.ceil((until - Date.now()) / 1000));
function useSecondsLeft(until) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => {
      tick((count) => count + 1);
      if (until <= Date.now()) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return secondsUntil(until);
}

/**
 * Asks for the 6-digit code Supabase emailed to `email`. The code is checked only by Supabase (`onVerify`); it is
 * never stored or logged. "Send a new code" waits RESEND_SECONDS between emails.
 */
export default function EmailCodeStep({
  email, intro, submitLabel, onVerify, onResend, onChangeEmail, sentJustNow = true,
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState('');
  const [resendAt, setResendAt] = useState(() => (sentJustNow ? Date.now() + RESEND_SECONDS * 1000 : 0));
  const working = useRef(false);
  const secondsLeft = useSecondsLeft(resendAt);

  const verify = async ({ code }) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await onVerify(code);
    } catch (error) {
      form.setFields([{ name: 'code', errors: [friendlyError(error)] }]);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (working.current || secondsLeft) return;
    working.current = true;
    setResending(true);
    try {
      await onResend();
      form.resetFields();
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setStatus('We sent a new code to ' + email + '.');
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      working.current = false;
      setResending(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={verify} requiredMark={false} className="email-code-step">
      <Paragraph type="secondary">
        {intro} <Text strong className="email-code-address">{email}</Text>. Enter it below; it expires after a while.
      </Paragraph>
      <Form.Item
        name="code"
        label={`${OTP_LENGTH}-digit code`}
        normalize={normalizeCode}
        validateTrigger="onSubmit"
        rules={[{ len: OTP_LENGTH, required: true, message: `Enter the ${OTP_LENGTH} digits from the email.` }]}
      >
        <Input
          className="email-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH + 2}
          placeholder={'0'.repeat(OTP_LENGTH)}
          autoFocus
        />
      </Form.Item>
      <Button type="primary" block htmlType="submit" loading={busy}>{submitLabel}</Button>
      <div className="email-code-actions">
        <Button type="link" onClick={resend} loading={resending} disabled={secondsLeft > 0 || busy}>
          {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : 'Send a new code'}
        </Button>
        <Button type="link" onClick={onChangeEmail} disabled={busy}>Use a different email</Button>
      </div>
      <Text type="secondary" className="email-code-status" role="status" aria-live="polite">{status}</Text>
    </Form>
  );
}
