import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Form, Input, Tag, Typography,
} from 'antd';
import { CheckCircleFilled, LogoutOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import UserAvatar from './UserAvatar';
import UsernameDialog from './UsernameDialog';
import ProfilePhoto from './ProfilePhoto';
import { SettingRow } from './SettingsSection';
import { managedAvatarSrc } from '../lib/avatarUrl';
import { maskEmail } from '../lib/email';
import { supabaseUrl } from '../supabase';
import { friendlyError } from '../lib/errors';
import { writeLastGroup } from '../lib/storage';
import { needsUsername } from '../lib/username';

const { Text } = Typography;

/** How the account signs in, from Supabase's list of its identities. */
function signInMethod(providers) {
  const email = providers.includes('email');
  const google = providers.includes('google');
  if (email && google) return 'Email and password, or Google';
  if (google) return 'Google';
  return 'Email and password';
}

/**
 * The signed-in account, first in Settings: photo, display name and @username (shown once, in the header), the email
 * address (masked, and only ever shown to its owner), the username and sign-in rows, the display-name form and sign-out.
 */
export default function AccountSettings() {
  const {
    auth, workspace, notify, modal,
  } = useApp();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [changingUsername, setChangingUsername] = useState(false);
  const { user } = auth;
  const { profile } = workspace;
  const displayName = profile?.display_name || user.user_metadata?.display_name || '';
  const provisional = needsUsername(profile);
  const providers = user.app_metadata?.providers || [];
  // Accounts made with Google only have no password to change.
  const hasPassword = providers.includes('email');
  // Only a photo this app uploaded for this user is shown; anything else falls back to the initial.
  const photo = managedAvatarSrc(profile?.avatar_url, user.id, supabaseUrl);

  const saveName = async ({ display_name: value }) => {
    const name = value.trim();
    setSaving(true);
    try {
      await workspace.actions.saveProfile({ display_name: name });
      await auth.updateDisplayName(name);
      workspace.actions.setProfile({ ...(profile || {}), display_name: name });
      notify.success('Name saved');
    } catch (error) {
      notify.error('Could not save your name: ' + friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => modal.confirm({
    title: 'Sign out on this device?',
    content: 'Your groups stay in your account. Nothing from your account is kept on this device.',
    okText: 'Sign out',
    onOk: async () => {
      try {
        await auth.signOut();
        writeLastGroup(null);
        navigate('/');
        notify.success('Signed out');
      } catch (error) {
        notify.error('Could not sign out: ' + friendlyError(error));
      }
    },
  });

  return (
    <div className="account-card">
      <div className="account-header">
        <UserAvatar name={displayName || user.email} seed={user.id} size={56} src={photo} />
        <div className="account-identity">
          <h3 className="account-title">{displayName || 'Your account'}</h3>
          {profile?.username && !provisional && <Text className="account-username">@{profile.username}</Text>}
          <ProfilePhoto hasPhoto={Boolean(photo)} />
        </div>
        <Button icon={<LogoutOutlined />} onClick={signOut} className="account-signout">Sign out</Button>
      </div>

      <SettingRow label="Email" help="Only you can see this.">
        <span className="account-email">
          <span>{maskEmail(user.email)}</span>
          {user.email_confirmed_at
            ? <Tag icon={<CheckCircleFilled />}>Verified</Tag>
            : <Tag>Not verified</Tag>}
        </span>
      </SettingRow>

      <SettingRow
        label="Username"
        help={provisional || !profile?.username
          ? 'Not chosen yet. Friends add you to groups by it.'
          : 'Friends add you to groups by it. You can change it once every 30 days.'}
      >
        {profile?.username && (
          <Button onClick={() => setChangingUsername(true)}>{provisional ? 'Choose username' : 'Change username'}</Button>
        )}
      </SettingRow>

      <SettingRow label="Sign-in method" help={signInMethod(providers)}>
        {hasPassword
          ? <Button onClick={() => navigate('/reset-password')}>Change password</Button>
          : <Text type="secondary">You sign in with Google</Text>}
      </SettingRow>

      <Form
        className="settings-row account-name-form"
        layout="vertical"
        onFinish={saveName}
        initialValues={{ display_name: displayName }}
        requiredMark={false}
      >
        <div className="settings-row-copy">
          <label htmlFor="display_name" className="settings-row-label">Display name</label>
          <span className="settings-row-help">Shown to members of groups you share.</span>
        </div>
        <div className="settings-row-control account-name-control">
          <Form.Item name="display_name" rules={[{ required: true, whitespace: true, message: 'Add your name' }]}>
            <Input placeholder="Your name" maxLength={80} autoComplete="name" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Save name</Button>
        </div>
      </Form>
      <UsernameDialog open={changingUsername} onClose={() => setChangingUsername(false)} />
    </div>
  );
}
