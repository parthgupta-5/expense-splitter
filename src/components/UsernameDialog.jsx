import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Button, Form, Input, Modal, Typography,
} from 'antd';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { nextUsernameChange, normalizeUsername, usernameProblem } from '../lib/username';

const { Paragraph, Text } = Typography;
const CHECK_DELAY_MS = 400;
const AVAILABILITY = {
  available: (name) => '@' + name + ' is available',
  yours: () => 'This is already your username',
  taken: () => 'That username is taken',
  reserved: () => 'That username is reserved',
};

/**
 * Choose or change the @username. `required`: shown after sign-in while the account still has its provisional
 * name; it cannot be dismissed (only signing out leaves it). Otherwise it is the "Change" dialog from Settings.
 */
export default function UsernameDialog({ open, required = false, onClose }) {
  const { workspace, auth, notify } = useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState('');
  const checkTimer = useRef(null);
  const profile = workspace.profile;
  const nextChange = required ? null : nextUsernameChange(profile);

  const currentUsername = profile?.username || '';

  const checkAvailability = useCallback((value) => {
    clearTimeout(checkTimer.current);
    setAvailability('');
    const name = normalizeUsername(value);
    if (!name || usernameProblem(name)) return;
    checkTimer.current = setTimeout(() => {
      repo.checkUsername(name)
        .then((status) => {
          if (normalizeUsername(form.getFieldValue('username')) === name) setAvailability(AVAILABILITY[status]?.(name) || '');
        })
        .catch(() => {}); // the save itself reports any real problem
    }, CHECK_DELAY_MS);
  }, [form]);

  // Start from a suggestion (first choice) or the current name (change).
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    if (!required) {
      form.setFieldsValue({ username: currentUsername });
      return undefined;
    }
    repo.suggestUsername()
      .then((name) => {
        if (!active || !name || form.getFieldValue('username')) return;
        form.setFieldsValue({ username: name });
        checkAvailability(name);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [open, required, form, currentUsername, checkAvailability]);

  useEffect(() => () => clearTimeout(checkTimer.current), []);

  const save = async ({ username }) => {
    setBusy(true);
    try {
      const { username: saved } = await workspace.actions.setUsername(normalizeUsername(username));
      notify.success('Your username is @' + saved);
      setAvailability('');
      onClose?.();
    } catch (error) {
      form.setFields([{ name: 'username', errors: [friendlyError(error)] }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={required ? 'Choose your username' : 'Change your username'}
      open={open}
      onCancel={required ? undefined : onClose}
      closable={!required}
      keyboard={!required}
      mask={{ closable: !required }}
      footer={null}
      destroyOnHidden
    >
      <Paragraph type="secondary">
        Friends will use your username to find you. It is shown as @name; your email address stays private.
        {' '}You can change it later, once every 30 days.
      </Paragraph>
      {nextChange && (
        <Paragraph className="username-cooldown">
          You can choose a new username again on {nextChange.toLocaleDateString()}. You can still go back to a name
          you gave up in the last 30 days.
        </Paragraph>
      )}
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item
          name="username"
          label="Username"
          validateTrigger={['onChange', 'onBlur']}
          rules={[
            { required: true, message: 'Choose a username' },
            {
              validator: (_, value) => {
                const problem = value ? usernameProblem(normalizeUsername(value)) : null;
                return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
              },
            },
          ]}
          extra={<Text type="secondary" aria-live="polite" className="username-availability">{availability}</Text>}
        >
          <Input
            prefix="@"
            maxLength={21}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="priya123"
            onChange={(event) => checkAvailability(event.target.value)}
          />
        </Form.Item>
        <div className="username-actions">
          {required ? (
            <Button type="link" onClick={() => auth.signOut().catch((error) => notify.error(friendlyError(error)))}>
              Sign out
            </Button>
          ) : (
            <Button onClick={onClose}>Cancel</Button>
          )}
          <Button type="primary" htmlType="submit" loading={busy}>Save username</Button>
        </div>
      </Form>
    </Modal>
  );
}
