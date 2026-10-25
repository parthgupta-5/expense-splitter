import React from 'react';
import { Avatar, Button, Divider, Form, Input, Tag, Typography } from 'antd';
import { CheckCircleFilled, CloudOutlined, LoginOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { isHttpsUrl } from '../lib/url';

const { Text } = Typography;

const httpsRule = {
  validator: (_, value) => (!value || isHttpsUrl(value)
    ? Promise.resolve()
    : Promise.reject(new Error('Use an https:// image link'))),
};

export default function ProfilePage({ user, form, cloudConfigured, onSave, onSignOut, onSignIn }) {
  if (!user) {
    return (
      <section className="page-panel profile-panel">
        <div className="auth-prompt">
          <Avatar size={58} icon={<UserOutlined />} />
          <Button type="primary" icon={<LoginOutlined />} onClick={onSignIn}>Sign in or create account</Button>
        </div>
        <Tag icon={<CloudOutlined />} color={cloudConfigured ? 'blue' : 'orange'}>
          {cloudConfigured ? 'Cloud connection ready' : 'Cloud accounts are not configured'}
        </Tag>
      </section>
    );
  }
  return (
    <section className="page-panel profile-panel">
      <div className="account-status">
        <Tag color="green" icon={<CheckCircleFilled />}>Signed in</Tag>
        <Text>{user.email}</Text>
      </div>
      <Form form={form} layout="vertical" onFinish={onSave} className="profile-form">
        <Form.Item name="display_name" label="Display name">
          <Input placeholder="Your name" maxLength={80} />
        </Form.Item>
        <Form.Item name="avatar_url" label="Profile image URL" rules={[httpsRule]}>
          <Input placeholder="https://…" maxLength={500} />
        </Form.Item>
        <Button type="primary" htmlType="submit">Save profile</Button>
      </Form>
      <Divider />
      <Button danger icon={<LogoutOutlined />} onClick={onSignOut}>Sign out</Button>
    </section>
  );
}
