import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Button, List, Modal, Popconfirm, Tag, Typography,
} from 'antd';
import { CrownOutlined, LoginOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import UserAvatar from './UserAvatar';
import { friendlyError } from '../lib/errors';

const { Paragraph, Text } = Typography;

/**
 * Who can open and edit a group. Members are accounts; the people in the split can be anyone. Inviting happens in the
 * people list (Add people → Add by username), which adds the person and invites the account in one step. The owner
 * can remove members here; members can leave. Email addresses are never shown.
 */
export default function MembersModal({ group, open, onClose }) {
  const {
    auth, workspace, notify, openAuth,
  } = useApp();
  const navigate = useNavigate();
  const [members, setMembers] = useState(null); // null while loading
  const signedIn = Boolean(auth.user) && workspace.mode === 'cloud';
  const isOwner = group?.role === 'owner';

  const groupId = group?.id;
  const load = useCallback(() => repo.listMembers(groupId).then(setMembers).catch((error) => {
    setMembers((current) => current || []);
    notify.error('Could not load members: ' + friendlyError(error));
  }), [groupId, notify]);

  useEffect(() => {
    if (open && signedIn) load();
  }, [open, signedIn, load]);

  const remove = async (member) => {
    try {
      await repo.removeMember(group.id, member.user_id);
      notify.success((member.display_name || '@' + member.username) + ' was removed');
      await Promise.all([load(), workspace.actions.refreshGroup(group.id)]);
    } catch (error) {
      notify.error(friendlyError(error));
    }
  };

  const leave = async () => {
    if (await workspace.actions.leaveGroup(group.id)) {
      notify.success('You left ' + group.name);
      onClose();
      navigate('/groups');
    }
  };

  return (
    <Modal title={'Members of ' + (group?.name || 'this group')} open={open} onCancel={onClose} footer={null} destroyOnHidden>
      {!signedIn ? (
        <>
          <Paragraph>
            Sign in to share this group. Everyone who joins can add expenses and record payments, and changes show up
            for the whole group straight away.
          </Paragraph>
          <Button type="primary" icon={<LoginOutlined />} onClick={() => { onClose(); openAuth('signin'); }}>
            Sign in or create an account
          </Button>
        </>
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            className="members-hint"
            title={isOwner
              ? 'To invite someone, use Add people → Add by username in the people list. They can open the group once they accept.'
              : 'Only the owner can invite or remove members.'}
          />
          <Text className="modal-section-title">Members</Text>
          <List
            className="members-list"
            loading={members === null}
            dataSource={members || []}
            renderItem={(member) => {
              const you = member.user_id === auth.user?.id;
              const name = member.display_name || (member.username ? '@' + member.username : 'Member');
              const actions = [];
              if (isOwner && member.role !== 'owner') {
                actions.push(
                  <Popconfirm key="remove" title={'Remove ' + name + '?'} okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => remove(member)}>
                    <Button type="link" danger>Remove</Button>
                  </Popconfirm>,
                );
              }
              if (you && member.role !== 'owner') {
                actions.push(
                  <Popconfirm key="leave" title="Leave this group?" description="You will lose access to it." okText="Leave" okButtonProps={{ danger: true }} onConfirm={leave}>
                    <Button type="link" danger>Leave</Button>
                  </Popconfirm>,
                );
              }
              return (
                <List.Item actions={actions}>
                  <List.Item.Meta
                    avatar={<UserAvatar name={name.replace('@', '')} seed={member.user_id} />}
                    title={(
                      <span>
                        {name}
                        {you && <Text type="secondary"> (you)</Text>}
                        {member.role === 'owner' && <Tag icon={<CrownOutlined />} color="gold" style={{ marginLeft: 8 }}>Owner</Tag>}
                      </span>
                    )}
                    description={[
                      member.username && '@' + member.username,
                      member.person_name && 'is ' + member.person_name + ' in this group',
                    ].filter(Boolean).join(' · ')}
                  />
                </List.Item>
              );
            }}
          />
        </>
      )}
    </Modal>
  );
}
