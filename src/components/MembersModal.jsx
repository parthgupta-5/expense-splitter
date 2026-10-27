import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Avatar, Button, Form, Input, List, Modal, Popconfirm, Tag, Typography,
} from 'antd';
import { CrownOutlined, LoginOutlined, UserAddOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';

const { Paragraph, Text } = Typography;

/** Who can see and edit a group. Members are accounts; the people in the split can be anyone. */
export default function MembersModal({ group, open, onClose }) {
  const {
    auth, workspace, notify, openAuth,
  } = useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [members, setMembers] = useState(null); // null while loading
  const [inviting, setInviting] = useState(false);
  const signedIn = Boolean(auth.user) && workspace.mode === 'cloud';
  const isOwner = group?.role === 'owner';

  const groupId = group?.id;
  const load = useCallback(() => repo.listMembers(groupId)
    .then(setMembers)
    .catch((error) => {
      setMembers([]);
      notify.error('Could not load members: ' + friendlyError(error));
    }), [groupId, notify]);

  useEffect(() => {
    if (open && signedIn) load();
  }, [open, signedIn, load]);

  const invite = async ({ email }) => {
    setInviting(true);
    try {
      const added = await repo.inviteMember(group.id, email);
      notify.success((added?.display_name || email) + ' can now see and edit ' + group.name);
      form.resetFields();
      await Promise.all([load(), workspace.actions.refreshGroup(group.id)]);
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (member) => {
    try {
      await repo.removeMember(group.id, member.user_id);
      notify.success((member.display_name || member.email) + ' was removed');
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
            Sign in to share this group. Everyone you invite can add expenses and record payments, and changes show up
            for the whole group straight away.
          </Paragraph>
          <Button type="primary" icon={<LoginOutlined />} onClick={() => { onClose(); openAuth('signin'); }}>
            Sign in or create an account
          </Button>
        </>
      ) : (
        <>
          {isOwner ? (
            <>
              <Paragraph type="secondary">
                Invite a friend by the email they signed up with. They will see this group the next time they open the app.
              </Paragraph>
              <Form form={form} className="invite-form" onFinish={invite} aria-label="Invite a member">
                <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Enter their email address' }]}>
                  <Input placeholder="friend@example.com" autoComplete="off" aria-label="Friend's email address" />
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={inviting}>Invite</Button>
              </Form>
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              title="Only the owner can invite or remove members."
              style={{ marginBottom: 12 }}
            />
          )}
          <Text className="modal-section-title">Members</Text>
          <List
            className="members-list"
            loading={members === null}
            dataSource={members || []}
            renderItem={(member) => {
              const you = member.user_id === auth.user?.id;
              const actions = [];
              if (isOwner && member.role !== 'owner') {
                actions.push(
                  <Popconfirm key="remove" title={'Remove ' + (member.display_name || member.email) + '?'} onConfirm={() => remove(member)}>
                    <Button type="link" danger>Remove</Button>
                  </Popconfirm>,
                );
              }
              if (you && member.role !== 'owner') {
                actions.push(
                  <Popconfirm key="leave" title="Leave this group?" description="You will lose access to it." onConfirm={leave}>
                    <Button type="link" danger>Leave</Button>
                  </Popconfirm>,
                );
              }
              return (
                <List.Item actions={actions}>
                  <List.Item.Meta
                    avatar={<Avatar>{(member.display_name || member.email || '?').slice(0, 1).toUpperCase()}</Avatar>}
                    title={(
                      <span>
                        {member.display_name || member.email}
                        {you && <Text type="secondary"> (you)</Text>}
                        {member.role === 'owner' && <Tag icon={<CrownOutlined />} color="gold" style={{ marginLeft: 8 }}>Owner</Tag>}
                      </span>
                    )}
                    description={member.email}
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
