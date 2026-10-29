import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Alert, Button, Form, Input, Modal, Typography,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { SettingRow, SettingsSection } from './SettingsSection';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { rememberReturnPath } from '../lib/authRedirect';
import { groupPath } from '../lib/groupSlug';
import { forgetAccountOnDevice } from '../lib/storage';
import { normalizeUsername } from '../lib/username';

const { Paragraph, Text } = Typography;

/** The groups that block deletion, each linked to its page (where Group settings → Delete group is). */
function Blockers({ names, groups, onOpen }) {
  return (
    <Alert
      type="warning"
      showIcon
      className="delete-blockers"
      title="You own groups that other members use"
      description={(
        <>
          <Paragraph>
            Deleting your account would delete these groups for everyone, so it is not possible yet. Delete each group
            first (open it, then Group settings → Delete group). Handing a group over to someone else is not available
            yet.
          </Paragraph>
          <ul className="delete-blockers-list">
            {names.map((name) => {
              const group = groups.find((item) => item.name === name);
              return (
                <li key={name}>
                  {group ? <Link to={groupPath(group, groups)} onClick={onOpen}>{name}</Link> : name}
                </li>
              );
            })}
          </ul>
        </>
      )}
    />
  );
}

/**
 * The dialog: what happens, what blocks it, then type the @username. The server (the delete-account Edge Function and
 * the database) checks everything again and is the only place an account can be deleted. If the last sign-in is too
 * old, it asks to sign in again: the password for email accounts, Google for Google-only accounts.
 */
function DeleteAccountDialog({ open, onClose }) {
  const {
    auth, workspace, notify,
  } = useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [blockers, setBlockers] = useState(null); // null while checking
  const [step, setStep] = useState('confirm'); // 'confirm' | 'reauth'
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(''); // the username as typed, kept for a retry after signing in again
  const { user } = auth;
  const username = workspace.profile?.username || '';
  const typed = Form.useWatch('confirm', form) || '';
  const hasPassword = Boolean(user?.app_metadata?.providers?.includes('email'));

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    repo.accountDeletionBlockers()
      .then((rows) => { if (active) setBlockers(rows.map((row) => row.group_name)); })
      .catch((error) => { if (active) { setBlockers([]); setProblem('Could not check your groups: ' + friendlyError(error)); } });
    return () => { active = false; };
  }, [open]);

  const remove = async (confirmation) => {
    setConfirmed(confirmation);
    setBusy(true);
    setProblem('');
    try {
      const result = await repo.deleteAccount(normalizeUsername(confirmation));
      const id = user.id;
      await auth.forgetSession();
      forgetAccountOnDevice(id);
      onClose();
      navigate('/', { replace: true });
      const when = result.deletes_on
        ? 'on ' + new Date(result.deletes_on).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
        : 'in 7 days';
      notify.success(`Your account will be deleted ${when}. Sign in before then to restore it.`, 8);
    } catch (error) {
      if (error.code === 'reauth_required') setStep('reauth');
      else if (error.code === 'owns_shared_groups') setBlockers(error.groups || []);
      else if (error.code === 'confirmation_mismatch') form.setFields([{ name: 'confirm', errors: [error.message] }]);
      else setProblem(error.message || friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmWithPassword = async () => {
    setBusy(true);
    setProblem('');
    try {
      await auth.signIn({ email: user.email, password });
      setPassword('');
      setStep('confirm');
    } catch (error) {
      setProblem(friendlyError(error));
      setBusy(false);
      return;
    }
    setBusy(false);
    await remove(confirmed);
  };

  const confirmWithGoogle = async () => {
    rememberReturnPath('/settings#delete-account');
    try {
      await auth.signInWithGoogle(); // the browser leaves for Google and comes back to Settings
    } catch (error) {
      setProblem(friendlyError(error));
    }
  };

  const blocked = blockers?.length > 0;
  const matches = Boolean(username) && normalizeUsername(typed) === username;

  return (
    <Modal title="Delete your account?" open={open} onCancel={busy ? undefined : onClose} footer={null} destroyOnHidden>
      <div className="delete-account-dialog">
        <Paragraph strong>
          You have 7 days to change your mind. Sign in during that time and you can restore your account.
        </Paragraph>
        <Text strong>Switched off straight away</Text>
        <ul className="delete-account-list">
          <li>You are signed out everywhere, and nobody can find you, invite you or send you friend requests.</li>
          <li>Invitations and friend requests waiting on you, or sent from your groups, are withdrawn.</li>
        </ul>
        <Text strong>Deleted for good after 7 days</Text>
        <ul className="delete-account-list">
          <li>Your sign-in (email address, password, Google link), profile, @username, photo and friends.</li>
          <li>Groups you own that nobody else uses, with everything in them.</li>
          <li>Your memberships in other people&apos;s groups.</li>
        </ul>
        <Text strong>Kept in other people&apos;s groups</Text>
        <ul className="delete-account-list">
          <li>
            The name you appear under and the expenses and payments recorded there, so their balances stay right. They
            are no longer linked to you, and the history shows &quot;Former member&quot; instead of your name.
          </li>
        </ul>
        <Paragraph type="secondary">
          After that your @username becomes available to others. More detail: <Link to="/privacy#deletion" onClick={onClose}>Privacy Policy</Link>.
        </Paragraph>

        {blockers === null && <Text type="secondary" role="status">Checking your groups…</Text>}
        {blocked && <Blockers names={blockers} groups={workspace.groups} onOpen={onClose} />}
        {problem && <Alert type="error" showIcon className="delete-problem" title={problem} />}

        {blockers !== null && !blocked && step === 'confirm' && (
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={({ confirm }) => remove(confirm || '')}
            className="delete-account-form"
          >
            <Form.Item
              name="confirm"
              label={<span>Type your username <strong>@{username}</strong> to confirm</span>}
            >
              <Input prefix="@" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={21} />
            </Form.Item>
            <div className="delete-account-actions">
              <Button onClick={onClose} disabled={busy}>Cancel</Button>
              <Button danger type="primary" htmlType="submit" icon={<DeleteOutlined />} loading={busy} disabled={!matches}>
                Delete my account
              </Button>
            </div>
          </Form>
        )}

        {step === 'reauth' && (
          <div className="delete-reauth" role="group" aria-labelledby="reauth-title">
            <Text strong id="reauth-title">Confirm it is you</Text>
            <Paragraph type="secondary">
              For your safety, deleting an account needs a sign-in from the last 15 minutes.
            </Paragraph>
            {hasPassword ? (
              <Form layout="vertical" requiredMark={false} onFinish={confirmWithPassword}>
                <Form.Item label="Your password" htmlFor="reauth-password">
                  <Input.Password
                    id="reauth-password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Form.Item>
                <div className="delete-account-actions">
                  <Button onClick={onClose} disabled={busy}>Cancel</Button>
                  <Button danger type="primary" htmlType="submit" loading={busy} disabled={!password}>
                    Confirm and delete
                  </Button>
                </div>
              </Form>
            ) : (
              <div className="delete-account-actions">
                <Button onClick={onClose}>Cancel</Button>
                <Button type="primary" onClick={confirmWithGoogle}>Sign in with Google again</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Settings: a separate, clearly destructive area at the end of the page, below a divider. */
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection id="delete-account" title="Delete account" className="danger-card">
      <SettingRow
        label="Delete your account"
        help="Switches your account off now and deletes it after 7 days, unless you sign in and restore it. Shared groups may need to be resolved first."
      >
        <Button danger icon={<DeleteOutlined />} onClick={() => setOpen(true)}>Delete account…</Button>
      </SettingRow>
      {open && <DeleteAccountDialog open onClose={() => setOpen(false)} />}
    </SettingsSection>
  );
}
