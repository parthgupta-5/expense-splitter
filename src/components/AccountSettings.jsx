import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Card, Form, Input, Tag, Typography,
} from 'antd';
import { CheckCircleFilled, LogoutOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import UserAvatar from './UserAvatar';
import UsernameDialog from './UsernameDialog';
import ProfilePhoto from './ProfilePhoto';
import { managedAvatarSrc } from '../lib/avatarUrl';
import { supabaseUrl } from '../supabase';
import { friendlyError } from '../lib/errors';
import { writeLastGroup } from '../lib/storage';
import { needsUsername } from '../lib/username';

const { Text, Title } = Typography;

/** The signed-in account: name, @username, email (shown only to its owner), status and sign-out. First in Settings. */
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
  // Accounts made with Google only have no password to change.
  const hasPassword = Boolean(user.app_metadata?.providers?.includes('email'));
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
    <Card className="setting-card account-card" id="account">
      <section aria-labelledby="account-heading">
        <div className="account-header">
          <UserAvatar name={displayName || user.email} seed={user.id} size={56} src={photo} />
          <div className="account-identity">
            <Title level={2} id="account-heading" className="account-title">{displayName || 'Your account'}</Title>
            {profile?.username && !provisional && <Text className="account-username">@{profile.username}</Text>}
          </div>
        </div>

        <dl className="account-details">
          <div>
            <dt>Photo</dt>
            <dd><ProfilePhoto hasPhoto={Boolean(photo)} /></dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}<Text type="secondary" className="account-note"> · only you can see this</Text></dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>
              {provisional || !profile?.username ? <Text type="secondary">Not chosen yet</Text> : '@' + profile.username}
              {profile?.username && (
                <Button size="small" className="account-inline-button" onClick={() => setChangingUsername(true)}>
                  {provisional ? 'Choose' : 'Change'}
                </Button>
              )}
            </dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd>
              {hasPassword
                ? <Button size="small" className="account-inline-button" onClick={() => navigate('/reset-password')}>Change password</Button>
                : <Text type="secondary">You sign in with Google</Text>}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="account-status">
              <Tag icon={<CheckCircleFilled />}>Signed in</Tag>
              <Tag>{user.email_confirmed_at ? 'Email verified' : 'Email not verified'}</Tag>
              <Tag>Groups saved to your account</Tag>
            </dd>
          </div>
        </dl>

        <Form
          layout="vertical"
          onFinish={saveName}
          className="account-name-form"
          initialValues={{ display_name: displayName }}
        >
          <Form.Item
            name="display_name"
            label="Display name"
            extra="Shown to members of groups you share."
            rules={[{ required: true, whitespace: true, message: 'Add your name' }]}
          >
            <Input placeholder="Your name" maxLength={80} autoComplete="name" />
          </Form.Item>
          <div className="account-actions">
            <Button type="primary" htmlType="submit" loading={saving}>Save name</Button>
            <Button danger icon={<LogoutOutlined />} onClick={signOut}>Sign out</Button>
          </div>
        </Form>
      </section>
      <UsernameDialog open={changingUsername} onClose={() => setChangingUsername(false)} />
    </Card>
  );
}
