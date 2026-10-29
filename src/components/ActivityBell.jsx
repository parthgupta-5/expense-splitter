import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Badge, Button, Drawer, Popconfirm, Tooltip, Typography,
} from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { useAnswerInvitation } from '../state/useInvitations';
import { friendLabel, useAnswerFriendRequest } from '../state/useFriends';
import { invitedBy } from './InvitationsPanel';

const { Text, Title } = Typography;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** What the bell's count is made of, for its label and for screen readers. */
function waitingSummary(invitations, friendRequests) {
  const parts = [];
  if (invitations) parts.push(plural(invitations, 'group invitation'));
  if (friendRequests) parts.push(plural(friendRequests, 'friend request'));
  return parts.join(' and ');
}

/**
 * Notifications (signed-in only: guests never see them): group invitations and friend requests waiting for an answer,
 * which can be accepted or declined right here. The count is how many are waiting; it goes down only when one is
 * answered (or withdrawn, or expires). What happened in the groups is on the Recent activities page, not here.
 */
export default function ActivityBell() {
  const {
    workspace, notify, invitations, friends,
  } = useApp();
  const [open, setOpen] = useState(false);
  const waitingInvitations = invitations.pending.length;
  const waitingFriends = friends.incoming.length;
  const waiting = waitingInvitations + waitingFriends;
  const summary = waitingSummary(waitingInvitations, waitingFriends);

  // Focus moves into the panel when it opens and back to the bell when it is dismissed. The drawer tries this itself,
  // but only after its animation, and its first open can miss the panel, so it is done here.
  const bellRef = useRef(null);
  const bodyRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      const drawer = bodyRef.current?.closest('.ant-drawer');
      if (drawer && !drawer.contains(document.activeElement)) bodyRef.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const show = () => {
    setOpen(true);
    invitations.reload();
    friends.reload();
  };
  const dismiss = () => {
    setOpen(false);
    bellRef.current?.focus({ preventScroll: true });
  };

  const { answer, busyId } = useAnswerInvitation({
    invitations, workspace, notify, onDone: () => setOpen(false),
  });
  const friendAnswers = useAnswerFriendRequest({ friends, notify });
  const busy = Boolean(busyId || friendAnswers.busyId);

  return (
    <span className="activity-bell">
      <Tooltip title="Notifications">
        <Badge count={waiting} size="small" overflowCount={9} offset={[-6, 6]} className="notification-badge">
          <Button
            ref={bellRef}
            shape="circle"
            type="text"
            icon={<BellOutlined />}
            onClick={show}
            aria-label={waiting ? `Notifications (${summary})` : 'Notifications'}
            aria-haspopup="dialog"
            aria-expanded={open}
          />
        </Badge>
      </Tooltip>
      <span className="visually-hidden" role="status">{summary}</span>
      <Drawer
        title="Notifications"
        open={open}
        onClose={dismiss}
        placement="right"
        size={400}
        rootClassName="activity-drawer"
        styles={{ wrapper: { maxWidth: '100vw' } }}
        destroyOnHidden
      >
        <div ref={bodyRef} tabIndex={-1} className="activity-panel-body">
          {!waiting && !invitations.error && !friends.error && (
            <p className="bell-caught-up">You are all caught up. Nothing needs your answer.</p>
          )}
          <section aria-labelledby="bell-invitations" className="bell-section">
            <Title level={3} id="bell-invitations" className="bell-heading">Group invitations</Title>
            {invitations.error && <Text type="danger" role="alert">{invitations.error}</Text>}
            {invitations.pending.length === 0 ? (
              !invitations.error && <p className="bell-empty">No pending invitations.</p>
            ) : (
              <ul className="bell-invitations" aria-label="Invitations waiting for your answer">
                {invitations.pending.map((invitation) => (
                  <li key={invitation.id} className="bell-invitation">
                    <span className="bell-invitation-text">
                      <strong>{invitedBy(invitation)}</strong> invited you to join <strong>{invitation.group_name}</strong>.
                    </span>
                    <Text type="secondary" className="bell-invitation-meta">
                      You would join as {invitation.person_name}
                      {invitation.expires_at && <> · expires {new Date(invitation.expires_at).toLocaleDateString()}</>}
                    </Text>
                    <span className="bell-invitation-actions">
                      <Button
                        type="primary"
                        size="small"
                        loading={busyId === invitation.id}
                        disabled={busy}
                        onClick={() => answer(invitation, true)}
                        aria-label={`Accept the invitation to ${invitation.group_name}`}
                      >
                        Accept
                      </Button>
                      <Popconfirm
                        title={`Decline the invitation to ${invitation.group_name}?`}
                        description="They will not be able to invite you as this person again for 7 days."
                        okText="Decline"
                        onConfirm={() => answer(invitation, false)}
                      >
                        <Button size="small" disabled={busy} aria-label={`Decline the invitation to ${invitation.group_name}`}>
                          Decline
                        </Button>
                      </Popconfirm>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="bell-friends" className="bell-section">
            <Title level={3} id="bell-friends" className="bell-heading">Friend requests</Title>
            {friends.error && <Text type="danger" role="alert">{friends.error}</Text>}
            {friends.incoming.length === 0 ? (
              !friends.error && <p className="bell-empty">No friend requests.</p>
            ) : (
              <ul className="bell-invitations" aria-label="Friend requests waiting for your answer">
                {friends.incoming.map((request) => (
                  <li key={request.friendship_id} className="bell-invitation">
                    <span className="bell-invitation-text">
                      <strong>{friendLabel(request)}</strong> wants to be your friend.
                    </span>
                    <span className="bell-invitation-actions">
                      <Button
                        type="primary"
                        size="small"
                        loading={friendAnswers.busyId === request.friendship_id}
                        disabled={busy}
                        onClick={() => friendAnswers.answer(request, true)}
                        aria-label={`Accept the friend request from @${request.username}`}
                      >
                        Accept
                      </Button>
                      <Popconfirm
                        title={`Decline the friend request from @${request.username}?`}
                        description="They will not be able to ask again for 7 days."
                        okText="Decline"
                        onConfirm={() => friendAnswers.answer(request, false)}
                      >
                        <Button size="small" disabled={busy} aria-label={`Decline the friend request from @${request.username}`}>
                          Decline
                        </Button>
                      </Popconfirm>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="bell-footer">
            <Link to="/activity" onClick={() => setOpen(false)}>See recent activities in your groups</Link>
          </p>
        </div>
      </Drawer>
    </span>
  );
}
