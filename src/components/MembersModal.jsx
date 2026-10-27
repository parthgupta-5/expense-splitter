import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Avatar, Button, Form, Input, List, Modal, Popconfirm, Select, Tag, Typography,
} from 'antd';
import { CrownOutlined, LoginOutlined, UserAddOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { USERNAME_RULES, normalizeUsername, usernameProblem } from '../lib/username';
import InvitationStatus from './InvitationStatus';

const { Paragraph, Text } = Typography;

/**
 * Who can see and edit a group. Members are accounts; the people in the split can be anyone. The owner invites an
 * account by its @username to become one of the group's people; the database checks every rule. Email addresses are
 * never shown.
 */
export default function MembersModal({ group, open, onClose }) {
  const {
    auth, workspace, notify, openAuth,
  } = useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [members, setMembers] = useState(null); // null while loading
  const [invitations, setInvitations] = useState([]);
  const [inviting, setInviting] = useState(false);
  const signedIn = Boolean(auth.user) && workspace.mode === 'cloud';
  const isOwner = group?.role === 'owner';

  const groupId = group?.id;
  const load = useCallback(() => Promise.all([
    repo.listMembers(groupId).then(setMembers),
    isOwner ? repo.listGroupInvitations(groupId).then(setInvitations) : Promise.resolve(),
  ]).catch((error) => {
    setMembers((current) => current || []);
    notify.error('Could not load members: ' + friendlyError(error));
  }), [groupId, isOwner, notify]);

  useEffect(() => {
    if (open && signedIn) load();
  }, [open, signedIn, load]);

  // People who can still be offered to an account: not linked, and no invitation waiting.
  const waiting = new Set(invitations.filter((item) => item.status === 'pending').map((item) => item.person_id));
  const available = (group?.personRecords || []).filter((person) => !person.userId && !waiting.has(person.id));

  const invite = async ({ personId, username }) => {
    setInviting(true);
    try {
      const sent = await repo.inviteByUsername(group.id, personId, normalizeUsername(username));
      notify.success(`Invitation sent to @${sent.username} to join as ${sent.person_name}`);
      form.resetFields();
      await load();
    } catch (error) {
      form.setFields([{ name: 'username', errors: [friendlyError(error)] }]);
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (invitation) => {
    try {
      await repo.revokeInvitation(invitation.id);
      notify.success(`Invitation for ${invitation.person_name} revoked`);
      await load();
    } catch (error) {
      notify.error(friendlyError(error));
    }
  };

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
    <Modal title={'Share ' + (group?.name || 'group')} open={open} onCancel={onClose} footer={null} destroyOnHidden>
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
          {isOwner ? (
            <section aria-labelledby="invite-heading">
              <Text className="modal-section-title" id="invite-heading">Invite by username</Text>
              <Paragraph type="secondary">
                Choose who they are in this group, then enter their @username. They can accept or decline from their
                Groups page. Invitations expire after 30 days.
              </Paragraph>
              {available.length === 0 ? (
                <Alert
                  type="info"
                  showIcon
                  title="Everyone in this group is already linked or invited. Add a person to the group to invite someone new."
                />
              ) : (
                <Form form={form} layout="vertical" className="invite-username-form" onFinish={invite} requiredMark={false}>
                  <Form.Item name="personId" label="Who they are in this group" rules={[{ required: true, message: 'Choose a person' }]}>
                    <Select
                      placeholder="Choose a person"
                      options={available.map((person) => ({ value: person.id, label: person.name }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="username"
                    label="Their username"
                    rules={[{
                      required: true,
                      // Only the format is checked here; whether the account exists is the server's answer.
                      validator: (_, value) => {
                        if (!value) return Promise.reject(new Error('Enter their username'));
                        return usernameProblem(normalizeUsername(value)) === USERNAME_RULES
                          ? Promise.reject(new Error(USERNAME_RULES))
                          : Promise.resolve();
                      },
                    }]}
                  >
                    <Input prefix="@" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={21} placeholder="priya123" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={inviting}>Send invitation</Button>
                </Form>
              )}
              {invitations.length > 0 && (
                <>
                  <Text className="modal-section-title">Invitations</Text>
                  <List
                    className="members-list"
                    dataSource={invitations}
                    renderItem={(invitation) => (
                      <List.Item
                        actions={invitation.status === 'pending' ? [
                          <Popconfirm
                            key="revoke"
                            title={`Revoke the invitation for ${invitation.person_name}?`}
                            description={`@${invitation.invitee_username} will no longer be able to accept it.`}
                            okText="Revoke"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => revoke(invitation)}
                          >
                            <Button type="link" danger>Revoke</Button>
                          </Popconfirm>,
                        ] : []}
                      >
                        <List.Item.Meta
                          title={<span>{invitation.person_name} <Text type="secondary">· @{invitation.invitee_username}</Text></span>}
                          description={<InvitationStatus invitation={invitation} />}
                        />
                      </List.Item>
                    )}
                  />
                </>
              )}
            </section>
          ) : (
            <Alert type="info" showIcon title="Only the owner can invite or remove members." style={{ marginBottom: 12 }} />
          )}
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
                    avatar={<Avatar aria-hidden="true">{name.replace('@', '').slice(0, 1).toUpperCase()}</Avatar>}
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
