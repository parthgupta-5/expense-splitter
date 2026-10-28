import React from 'react';
import {
  Button, Card, List, Popconfirm, Typography,
} from 'antd';
import { useApp } from '../state/AppContext';
import { useAnswerInvitation } from '../state/useInvitations';
import InvitationStatus from './InvitationStatus';

const { Text, Title } = Typography;

/** "Owner name (@owner)" or whichever of the two is known. */
export const invitedBy = (invitation) => {
  const name = invitation.invited_by_name;
  const handle = invitation.invited_by_username ? '@' + invitation.invited_by_username : '';
  if (name && handle) return `${name} (${handle})`;
  return name || handle || 'The owner';
};

/**
 * Invitations sent to the signed-in user (pending first, then the last 30 days' answers). Accepting joins the group as
 * the person the owner chose; declining shares nothing. The same list as the bell's. Signed-in only.
 */
export default function InvitationsPanel() {
  const { workspace, notify, invitations } = useApp();
  const { answer, busyId } = useAnswerInvitation({ invitations, workspace, notify });
  const { rows, error, pending } = invitations;

  if (!rows.length && !error) return null;

  return (
    <Card className="invitations-panel" aria-labelledby="invitations-heading">
      <Title level={2} id="invitations-heading" className="invitations-title">
        Invitations for you{pending.length ? ` (${pending.length})` : ''}
      </Title>
      {error && <Text type="danger" role="alert">{error}</Text>}
      <List
        dataSource={rows}
        renderItem={(invitation) => {
          const busy = busyId === invitation.id;
          return (
            <List.Item
              actions={invitation.status === 'pending' ? [
                <Button key="accept" type="primary" size="small" loading={busy} disabled={Boolean(busyId)} onClick={() => answer(invitation, true)}>
                  Accept
                </Button>,
                <Popconfirm
                  key="decline"
                  title={`Decline the invitation to ${invitation.group_name}?`}
                  description="They will not be able to invite you as this person again for 7 days."
                  okText="Decline"
                  onConfirm={() => answer(invitation, false)}
                >
                  <Button size="small" disabled={Boolean(busyId)}>Decline</Button>
                </Popconfirm>,
              ] : []}
            >
              <List.Item.Meta
                title={<span><strong>{invitation.group_name}</strong> <Text type="secondary">· join as {invitation.person_name}</Text></span>}
                description={(
                  <span className="invitation-meta">
                    <Text type="secondary">From {invitedBy(invitation)}</Text>
                    <InvitationStatus invitation={invitation} />
                  </span>
                )}
              />
            </List.Item>
          );
        }}
      />
    </Card>
  );
}
