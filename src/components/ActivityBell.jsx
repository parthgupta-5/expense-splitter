import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Badge, Button, Drawer, Empty, Popconfirm, Spin, Tooltip, Typography,
} from 'antd';
import { BellOutlined, ReloadOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { useActivityFeed } from '../state/useActivityFeed';
import { useAnswerInvitation } from '../state/useInvitations';
import { invitedBy } from './InvitationsPanel';
import { describeActivity } from '../lib/activity';
import { accessibleActivity, isUnread } from '../lib/activityFeed';
import { formatCents } from '../lib/currency';
import { groupPath } from '../lib/groupSlug';

const { Text, Title } = Typography;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

function LiveStatus({ realtime }) {
  if (realtime === 'live') {
    return <><span className="activity-live-dot" aria-hidden="true" />Live: new activity appears here as it happens.</>;
  }
  if (realtime === 'connecting') return 'Connecting to live updates… Showing recent history.';
  return 'Live updates are unavailable right now. Showing recent history.';
}

/** What the bell's count is made of, for its label and for screen readers. */
function unreadSummary(invitations, activity) {
  const parts = [];
  if (invitations) parts.push(plural(invitations, 'new invitation'));
  if (activity) parts.push(plural(activity, 'new update') + ' in your groups');
  return parts.join(' and ');
}

/**
 * Notifications (signed-in only: guests never see them): invitations waiting for an answer, which can be accepted or
 * declined right here, and recent activity in the user's groups. The count is what is new since the panel was last
 * opened on this device: unseen invitations plus other people's new activity. Opening the panel clears the count, but
 * an invitation stays here, pending, until it is answered (or revoked, or expires). Only groups the user can open are
 * listed under activity; an invitation shows only its own group's name and who sent it, to its recipient.
 */
export default function ActivityBell() {
  const {
    auth, workspace, notify, invitations,
  } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [newSince, setNewSince] = useState(null); // the seen id when the panel opened: later rows are marked new
  const userId = auth.user?.id;
  const { groups, realtime } = workspace;
  const feed = useActivityFeed({
    userId,
    enabled: Boolean(userId) && workspace.mode === 'cloud' && workspace.status === 'ready',
    realtime,
    onActivity: workspace.actions.onActivity,
  });
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const items = accessibleActivity(feed.rows, groupsById);
  const unreadActivity = items.filter((row) => isUnread(row, feed.seenId, userId)).length;
  const unseenInvitations = invitations.unseen.length;
  const unread = unseenInvitations + unreadActivity;
  const summary = unreadSummary(unseenInvitations, unreadActivity);

  // While the panel is open, everything in it (including what arrives live) counts as seen.
  const { markSeen } = feed;
  const markInvitationsSeen = invitations.markSeen;
  useEffect(() => { if (open) markSeen(); }, [open, feed.rows, markSeen]);
  useEffect(() => { if (open) markInvitationsSeen(); }, [open, invitations.pending, markInvitationsSeen]);

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
    setNewSince(feed.seenId);
    setOpen(true);
    feed.reload();
    invitations.reload();
  };
  const dismiss = () => {
    setOpen(false);
    bellRef.current?.focus({ preventScroll: true });
  };

  const { answer, busyId } = useAnswerInvitation({
    invitations, workspace, notify, onDone: () => setOpen(false),
  });

  const openGroup = (groupId) => {
    const group = groupsById.get(groupId);
    if (!group) {
      notify.info('You no longer have access to that group.');
      return;
    }
    setOpen(false);
    navigate(groupPath(group, groups));
  };

  return (
    <span className="activity-bell">
      <Tooltip title="Notifications">
        <Badge count={unread} size="small" overflowCount={9} offset={[-6, 6]} className="notification-badge">
          <Button
            ref={bellRef}
            shape="circle"
            type="text"
            icon={<BellOutlined />}
            onClick={show}
            aria-label={unread ? `Notifications (${summary})` : 'Notifications'}
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
          {!invitations.pending.length && !items.length && !feed.loading && !feed.error && !invitations.error && (
            <p className="bell-caught-up">You are all caught up. Nothing needs your attention.</p>
          )}
          <section aria-labelledby="bell-invitations" className="bell-section">
            <Title level={3} id="bell-invitations" className="bell-heading">Invitations</Title>
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
                        disabled={Boolean(busyId)}
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
                        <Button size="small" disabled={Boolean(busyId)} aria-label={`Decline the invitation to ${invitation.group_name}`}>
                          Decline
                        </Button>
                      </Popconfirm>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="bell-activity" className="bell-section">
            <Title level={3} id="bell-activity" className="bell-heading">Activity</Title>
            <p className="activity-live"><LiveStatus realtime={realtime} /></p>
            {feed.error && (
              <Alert
                type="warning"
                showIcon
                className="activity-error"
                title={'Could not load activity: ' + feed.error}
                action={<Button size="small" icon={<ReloadOutlined />} onClick={feed.reload}>Retry</Button>}
              />
            )}
            {feed.loading && !items.length && (
              <div className="activity-loading" role="status">
                <Spin size="small" />
                <Text type="secondary">Loading activity…</Text>
              </div>
            )}
            {!feed.loading && !feed.error && !items.length && (
              <Empty
                className="activity-empty"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No recent activity in your groups. Expenses, payments and new members will show up here."
              />
            )}
            {items.length > 0 && (
              <ul className="activity-feed" aria-label="Recent activity, newest first">
                {items.map((row) => {
                  const group = groupsById.get(row.group_id);
                  const entry = row.actor_id === userId ? { ...row, actor_name: 'You' } : row;
                  const { text } = describeActivity(entry, (cents) => formatCents(cents, group.currencyCode));
                  const fresh = isUnread(row, newSince, userId);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={'activity-entry' + (fresh ? ' is-new' : '')}
                        onClick={() => openGroup(row.group_id)}
                      >
                        <span className="activity-entry-text">
                          {fresh && <span className="activity-new-dot" aria-hidden="true" />}
                          {fresh && <span className="visually-hidden">New: </span>}
                          {text}
                        </span>
                        <span className="activity-entry-meta">
                          {group.name}
                          {row.created_at && <> · <time dateTime={row.created_at}>{when(row.created_at)}</time></>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Drawer>
    </span>
  );
}
