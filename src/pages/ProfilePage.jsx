import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Avatar, Button, Divider, Form, Input, Tag, Typography,
} from 'antd';
import {
  CheckCircleFilled, CloudOutlined, LoginOutlined, LogoutOutlined, UserOutlined,
} from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import PageIntro from '../components/PageIntro';
import { friendlyError } from '../lib/errors';
import { writeLastGroup } from '../lib/storage';
import { isHttpsUrl } from '../lib/url';
import { supabaseConfigured } from '../supabase';

const { Paragraph, Text } = Typography;

const httpsRule = {
  validator: (_, value) => (!value || isHttpsUrl(value)
    ? Promise.resolve()
    : Promise.reject(new Error('Use an https:// image link'))),
};

export default function ProfilePage() {
  const {
    auth, workspace, notify, modal, openAuth,
  } = useApp();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { user } = auth;
  const { profile } = workspace;

  if (!user) {
    return (
      <>
        <PageIntro title="Your account" />
        <section className="page-panel profile-panel">
          <div className="auth-prompt">
            <Avatar size={58} icon={<UserOutlined />} />
            <div>
              <Paragraph>
                You are using Expense Splitter as a guest: everything is saved on this device. Create a free account to
                keep your groups on every device and share them with friends.
              </Paragraph>
              <Button type="primary" icon={<LoginOutlined />} onClick={() => openAuth('signup')}>
                Sign in or create account
              </Button>
            </div>
          </div>
          <Tag icon={<CloudOutlined />} color={supabaseConfigured ? 'blue' : 'orange'}>
            {supabaseConfigured ? 'Cloud accounts available' : 'Cloud accounts are not configured on this copy'}
          </Tag>
        </section>
      </>
    );
  }

  const save = async (values) => {
    setSaving(true);
    const updated = { display_name: values.display_name.trim(), avatar_url: values.avatar_url || '' };
    try {
      await workspace.actions.saveProfile({ ...updated, updated_at: new Date().toISOString() });
      await auth.updateDisplayName(updated.display_name);
      workspace.actions.setProfile({ ...(profile || {}), ...updated });
      notify.success('Profile saved');
    } catch (error) {
      notify.error('Profile save failed: ' + friendlyError(error));
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
    <>
      <PageIntro title="Your account" />
      <section className="page-panel profile-panel">
        <div className="account-status">
          <Tag color="green" icon={<CheckCircleFilled />}>Signed in</Tag>
          <Text>{user.email}</Text>
        </div>
        <Form
          layout="vertical"
          onFinish={save}
          className="profile-form"
          initialValues={{
            display_name: profile?.display_name || user.user_metadata?.display_name || '',
            avatar_url: profile?.avatar_url || '',
          }}
        >
          <Form.Item
            name="display_name"
            label="Display name"
            extra="Shown to members of groups you share."
            rules={[{ required: true, whitespace: true, message: 'Add your name' }]}
          >
            <Input placeholder="Your name" maxLength={80} />
          </Form.Item>
          <Form.Item name="avatar_url" label="Profile image URL" rules={[httpsRule]}>
            <Input placeholder="https://…" maxLength={500} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Save profile</Button>
        </Form>
        <Divider />
        <Button danger icon={<LogoutOutlined />} onClick={signOut}>Sign out</Button>
      </section>
    </>
  );
}
