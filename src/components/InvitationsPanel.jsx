import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Card, List, Popconfirm, Typography,
} from 'antd';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { groupPath } from '../lib/groupSlug';
import InvitationStatus from './InvitationStatus';

const { Text, Title } = Typography;

/**
 * Invitations sent to the signed-in user (pending first, then the last 30 days' answers). Accepting joins the group as
 * the person the owner chose; declining shares nothing. Signed-in only: guests never see this.
 */
export default function InvitationsPanel() {
  const { workspace, notify } = useApp();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const working = useRef(false);

  const load = useCallback(() => repo.listMyInvitations()
    .then((rows) => { setInvitations(rows); setError(''); })
    .catch((failure) => setError('Could not load your invitations: ' + friendlyError(failure))), []);

  useEffect(() => { load(); }, [load]);

  const answer = async (invitation, accepting) => {
    if (working.current) return;
    working.current = true;
    setBusyId(invitation.id);
    try {
      if (accepting) {
        const result = await repo.acceptInvitation(invitation.id);
        await workspace.actions.refreshGroup(result.group_id);
        notify.success(`You joined ${invitation.group_name} as ${result.person_name}`);
        navigate(groupPath({ id: result.group_id, name: invitation.group_name }, workspace.groups));
      } else {
        await repo.declineInvitation(invitation.id);
        notify.info(`Invitation to ${invitation.group_name} declined`);
      }
    } catch (failure) {
      notify.error(friendlyError(failure));
    } finally {
      working.current = false;
      setBusyId(null);
      load();
    }
  };

  if (!invitations.length && !error) return null;
  const pending = invitations.filter((item) => item.status === 'pending').length;

  return (
    <Card className="invitations-panel" aria-labelledby="invitations-heading">
      <Title level={2} id="invitations-heading" className="invitations-title">
        Invitations for you{pending ? ` (${pending})` : ''}
      </Title>
      {error && <Text type="danger" role="alert">{error}</Text>}
      <List
        dataSource={invitations}
        renderItem={(invitation) => {
          const from = invitation.invited_by_name || (invitation.invited_by_username ? '@' + invitation.invited_by_username : 'The owner');
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
                    <Text type="secondary">
                      From {from}{invitation.invited_by_username && invitation.invited_by_name ? ` (@${invitation.invited_by_username})` : ''}
                    </Text>
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
