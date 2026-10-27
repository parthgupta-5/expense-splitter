import React from 'react';
import { Navigate } from 'react-router';
import {
  Avatar, Button, Tag, Typography,
} from 'antd';
import { CloudOutlined, LoginOutlined, UserOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import PageIntro from '../components/PageIntro';
import { supabaseConfigured } from '../supabase';

const { Paragraph } = Typography;

/** Guests: what an account offers and how to get one. Signed-in account management lives in Settings. */
export default function ProfilePage() {
  const { auth, openAuth } = useApp();

  if (auth.user) return <Navigate replace to="/settings#account" />;

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
