import React from 'react';
import { Button, Card, Typography } from 'antd';
import { LoginOutlined, PlusOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { isNonEmptyGroup } from '../lib/storage';
import { supabaseConfigured } from '../supabase';

const { Paragraph, Text, Title } = Typography;

/**
 * A short first-time welcome. Signed in: shown while the account has no groups (its main action creates the first
 * one). Guest: shown on a fresh device whose only group is still empty, explaining that data stays on this device.
 * "Got it" hides it for good: in the account's preferences when signed in, on this device for guests.
 */
export default function WelcomePanel({ guest = false }) {
  const {
    workspace, openGroupDialog, openAuth, invitations,
  } = useApp();
  const { groups, preferences, actions } = workspace;
  const fresh = guest ? !groups.some(isNonEmptyGroup) : groups.length === 0;
  if (preferences.welcomeDismissed || !fresh) return null;
  const dismiss = () => actions.setPreferences({ welcomeDismissed: true });
  const waiting = !guest && invitations.pending.length > 0;

  return (
    <Card className="welcome-panel" aria-labelledby="welcome-heading">
      <Title level={2} id="welcome-heading" className="welcome-title">Welcome to Expense Splitter</Title>
      <Paragraph className="welcome-lead">Split shared costs without the awkward maths. Here is how it works:</Paragraph>
      <ol className="welcome-steps">
        <li><Text strong>Create a group</Text> for a trip, a flat or a dinner.</li>
        <li>
          <Text strong>Add people.</Text>
          {guest
            ? ' Add everyone who shares the costs, by name.'
            : ' You are added automatically. Add friends by their @username (they get an invitation) or as guests.'}
        </li>
        <li><Text strong>Record expenses:</Text> who paid, and who shares it.</li>
        <li><Text strong>Settle up</Text> with the fewest payments.</li>
      </ol>
      {guest && (
        <Paragraph type="secondary" className="welcome-note">
          You are using the app without an account, so everything is saved on this device only.
          {supabaseConfigured ? ' Sign in to keep your groups on every device and share them with friends.' : ''}
        </Paragraph>
      )}
      {waiting && (
        <Paragraph className="welcome-note">
          You also have an invitation waiting: answer it below or from the bell at the top.
        </Paragraph>
      )}
      <div className="welcome-actions">
        {guest ? (
          <>
            <Button type="primary" onClick={dismiss}>Got it</Button>
            {supabaseConfigured && <Button icon={<LoginOutlined />} onClick={() => openAuth('signup')}>Sign in or create account</Button>}
          </>
        ) : (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={openGroupDialog}>Create your first group</Button>
            <Button type="text" onClick={dismiss}>Got it</Button>
          </>
        )}
      </div>
    </Card>
  );
}
