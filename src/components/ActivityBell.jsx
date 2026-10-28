import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Badge, Button, Drawer, Empty, Spin, Tooltip, Typography,
} from 'antd';
import { BellOutlined, ReloadOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { useActivityFeed } from '../state/useActivityFeed';
import { describeActivity } from '../lib/activity';
import { accessibleActivity, hasUnread, isUnread } from '../lib/activityFeed';
import { formatCents } from '../lib/currency';
import { groupPath } from '../lib/groupSlug';

const { Text } = Typography;
const UNREAD_COLOR = '#43a87a'; // the approved positive-status green
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

function LiveStatus({ realtime }) {
  if (realtime === 'live') {
    return <><span className="activity-live-dot" aria-hidden="true" />Live: new activity appears here as it happens.</>;
  }
  if (realtime === 'connecting') return 'Connecting to live updates… Showing recent history.';
  return 'Live updates are unavailable right now. Showing recent history.';
}

/**
 * The signed-in user's recent group activity (signed-in only: guests never see it). A dot on the bell means someone
 * else did something since the panel was last opened on this device. Only groups the user can open are listed.
 */
export default function ActivityBell() {
  const { auth, workspace, notify } = useApp();
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
  const unread = hasUnread(items, feed.seenId, userId);

  // While the panel is open, everything in it (including what arrives live) counts as seen.
  const { markSeen } = feed;
  useEffect(() => { if (open) markSeen(); }, [open, feed.rows, markSeen]);

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
  };
  const dismiss = () => {
    setOpen(false);
    bellRef.current?.focus({ preventScroll: true });
  };

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
      <Tooltip title="Activity">
        <Badge dot={unread} color={UNREAD_COLOR} offset={[-7, 7]}>
          <Button
            ref={bellRef}
            shape="circle"
            type="text"
            icon={<BellOutlined />}
            onClick={show}
            aria-label={unread ? 'Activity (new activity)' : 'Activity'}
            aria-haspopup="dialog"
            aria-expanded={open}
          />
        </Badge>
      </Tooltip>
      <span className="visually-hidden" role="status">{unread ? 'New activity in your groups' : ''}</span>
      <Drawer
        title="Activity"
        open={open}
        onClose={dismiss}
        placement="right"
        size={400}
        rootClassName="activity-drawer"
        styles={{ wrapper: { maxWidth: '100vw' } }}
        destroyOnHidden
      >
        <div ref={bodyRef} tabIndex={-1} className="activity-panel-body">
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
        </div>
      </Drawer>
    </span>
  );
}
