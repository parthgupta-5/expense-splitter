import React, { useState } from 'react';
import {
  Alert, Button, Popconfirm, Tag, Typography,
} from 'antd';
import { CrownOutlined, UserAddOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { useGroupPeople } from '../state/useGroupPeople';
import * as repo from '../data/cloudRepo';
import AddPeopleModal from './AddPeopleModal';
import IncludeMeModal from './IncludeMeModal';
import UserAvatar from './UserAvatar';
import { memberAvatarSrc } from '../lib/avatarUrl';
import { friendlyError } from '../lib/errors';
import { describePeople } from '../lib/people';
import { supabaseUrl } from '../supabase';

const { Text, Title } = Typography;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
const STATUS = {
  pending: 'Invitation pending', declined: 'Declined', expired: 'Invitation expired', revoked: 'Invitation revoked', guest: 'Guest',
};

/** The tag and the small line under a person's name. Invitation details reach the owner only (the server decides). */
function statusOf(entry) {
  const { kind, invitation } = entry;
  const handle = invitation?.username ? '@' + invitation.username : '';
  if (kind === 'you' || kind === 'member') {
    return {
      tag: entry.role === 'owner' ? <Tag icon={<CrownOutlined />}>Owner</Tag> : <Tag>Member</Tag>,
      detail: entry.username ? '@' + entry.username : '',
    };
  }
  if (kind === 'local') return { tag: null, detail: '' };
  const details = {
    pending: [handle, invitation?.expiresAt && 'expires ' + day(invitation.expiresAt)],
    declined: [handle && handle + ' declined', invitation?.respondedAt && day(invitation.respondedAt)],
    expired: [handle, 'not answered in 30 days'],
    revoked: [handle],
    guest: [],
  };
  return { tag: <Tag>{STATUS[kind]}</Tag>, detail: (details[kind] || []).filter(Boolean).join(' · ') };
}

/**
 * Who is in the group's expenses, and what each person is: you, a member (an account with access), someone invited
 * (usable in expenses already, no access until they accept), or a guest (just a name). "Add people" offers adding by
 * username (which also invites) or adding a guest. In guest mode everyone is simply a name.
 */
export default function PeoplePanel({ group, onAddGuests, onRemove }) {
  const { auth, workspace, notify } = useApp();
  const cloud = Boolean(group.cloud) && workspace.mode === 'cloud';
  const isOwner = cloud && group.role === 'owner';
  const groupPeople = useGroupPeople({ group, enabled: cloud, onInvitationsChange: workspace.actions.onInvitationsChange });
  const entries = describePeople({
    people: group.people, records: group.personRecords, statuses: groupPeople.rows, userId: auth.user?.id, cloud,
  });
  const [adding, setAdding] = useState(null); // { mode, linkPerson }
  const [includingMe, setIncludingMe] = useState(false);
  const [busy, setBusy] = useState(null);
  const guests = entries.filter((entry) => entry.kind === 'guest' && entry.id);
  const refresh = () => Promise.all([workspace.actions.refreshGroup(group.id), groupPeople.reload()]);

  const run = async (key, task, success) => {
    setBusy(key);
    try {
      await task();
      notify.success(success);
      await refresh();
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };
  const revoke = (entry) => run('revoke' + entry.name, () => repo.revokeInvitation(entry.invitation.id),
    `Invitation for ${entry.name} revoked. ${entry.name} stays in the expenses.`);
  const resend = (entry) => run('resend' + entry.name, () => repo.inviteByUsername(group.id, entry.id, entry.invitation.username),
    `Invitation sent again to @${entry.invitation.username}`);
  const keepAsGuest = (entry) => run('guest' + entry.name, () => repo.keepPersonAsGuest(entry.id), `${entry.name} is now a guest`);

  const actionsFor = (entry) => {
    const remove = (
      <Button key="remove" size="small" type="text" danger onClick={() => onRemove(entry.name, { self: entry.kind === 'you' })}>
        {entry.kind === 'you' ? 'Remove me' : 'Remove'}
      </Button>
    );
    switch (entry.kind) {
      case 'local': return [remove];
      case 'you': return isOwner ? [remove] : [];
      case 'pending':
        return isOwner && entry.invitation?.id ? [
          <Popconfirm
            key="revoke"
            title={`Revoke the invitation for ${entry.name}?`}
            description={`${entry.invitation.username ? '@' + entry.invitation.username : 'They'} will no longer be able to accept it. ${entry.name} stays in the expenses.`}
            okText="Revoke"
            okButtonProps={{ danger: true }}
            onConfirm={() => revoke(entry)}
          >
            <Button size="small" type="text" danger loading={busy === 'revoke' + entry.name}>Revoke</Button>
          </Popconfirm>,
        ] : [];
      case 'declined':
      case 'expired':
      case 'revoked':
        return isOwner ? [
          entry.invitation?.username && (
            <Button key="resend" size="small" loading={busy === 'resend' + entry.name} onClick={() => resend(entry)}>Resend</Button>
          ),
          <Button key="guest" size="small" loading={busy === 'guest' + entry.name} onClick={() => keepAsGuest(entry)}>Keep as guest</Button>,
          remove,
        ].filter(Boolean) : [];
      case 'guest':
        return [
          isOwner && entry.id && (
            <Button key="invite" size="small" onClick={() => setAdding({ mode: 'username', linkPerson: entry })}>Invite</Button>
          ),
          remove,
        ].filter(Boolean);
      default: return [];
    }
  };

  const count = entries.length;
  return (
    <section className="section-card people-card" aria-labelledby="people-heading">
      <div className="section-heading">
        <div>
          <Title level={4} id="people-heading">People in {group.name}</Title>
          <Text type="secondary">{count} {count === 1 ? 'person' : 'people'}</Text>
        </div>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAdding({ mode: isOwner ? 'username' : 'guest' })}>
          Add people
        </Button>
      </div>
      {isOwner && !entries.some((entry) => entry.kind === 'you') && (
        <Alert
          type="info"
          showIcon
          className="include-me"
          title="You are not in this group's expenses yet."
          description="Add yourself if you pay for things or share costs here."
          action={<Button size="small" onClick={() => setIncludingMe(true)}>Add yourself</Button>}
        />
      )}
      {groupPeople.error && <Text type="danger" role="alert">Could not load everyone&apos;s status: {groupPeople.error}</Text>}
      {count === 0 ? (
        <p className="people-empty">
          No one here yet. Add the people who share costs in this group, then record your first expense.
        </p>
      ) : (
        <ul className="people-rows" aria-label={'People in ' + group.name}>
          {entries.map((entry) => {
            const { tag, detail } = statusOf(entry);
            const actions = actionsFor(entry);
            return (
              <li key={entry.name} className={'person-row person-' + entry.kind}>
                <UserAvatar
                  name={entry.name}
                  seed={entry.id || entry.name}
                  size={36}
                  src={memberAvatarSrc(entry.avatarUrl, supabaseUrl)}
                />
                <span className="person-main">
                  <span className="person-name">
                    <Text strong>{entry.name}</Text>
                    {entry.kind === 'you' && <Text type="secondary"> (you)</Text>}
                    {tag}
                  </span>
                  {detail && <Text type="secondary" className="person-detail">{detail}</Text>}
                </span>
                {actions.length > 0 && <span className="person-actions">{actions}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <AddPeopleModal
          open
          group={group}
          cloud={cloud}
          isOwner={isOwner}
          initialMode={adding.mode}
          linkPerson={adding.linkPerson || null}
          onClose={() => setAdding(null)}
          onAddGuests={onAddGuests}
          onChanged={refresh}
        />
      )}
      {includingMe && (
        <IncludeMeModal open group={group} guests={guests} onClose={() => setIncludingMe(false)} onChanged={refresh} />
      )}
    </section>
  );
}
