import React, { useState } from 'react';
import {
  Button, Dropdown, Empty, Form, Input, List, Popconfirm, Typography,
} from 'antd';
import { DownOutlined, LoginOutlined, UserAddOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { friendLabel, useAnswerFriendRequest } from '../state/useFriends';
import PageIntro from '../components/PageIntro';
import UserAvatar from '../components/UserAvatar';
import * as repo from '../data/cloudRepo';
import { memberAvatarSrc } from '../lib/avatarUrl';
import { friendlyError } from '../lib/errors';
import { normalizeUsername, usernameProblem } from '../lib/username';
import { supabaseUrl } from '../supabase';

const { Paragraph, Text, Title } = Typography;

function FriendAvatar({ row }) {
  return (
    <UserAvatar
      name={row.display_name || row.username}
      seed={row.user_id}
      src={memberAvatarSrc(row.avatar_url, supabaseUrl)}
    />
  );
}

/** Guests: friends need an account on both sides. */
function GuestFriends() {
  const { openAuth } = useApp();
  return (
    <section className="page-panel">
      <Empty
        className="empty-panel"
        description="Friends are people with an account who accepted your friend request. Sign in to add friends and to add them to your groups in one click."
      >
        <Button type="primary" icon={<LoginOutlined />} onClick={() => openAuth('signup')}>Sign in or create account</Button>
      </Empty>
    </section>
  );
}

/**
 * Friends: send a request to an exact @username; it becomes a friendship only when they accept (in their bell, or on
 * this page). Friends can be added to any group you own in one click, which sends them the group invitation.
 */
export default function PeoplePage() {
  const {
    workspace, notify, friends,
  } = useApp();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { answer, busyId: answering } = useAnswerFriendRequest({ friends, notify });

  if (workspace.mode !== 'cloud') {
    return (
      <>
        <PageIntro title="Friends" />
        <GuestFriends />
      </>
    );
  }

  const ownGroups = workspace.groups.filter((group) => group.role === 'owner');

  const send = async ({ username }) => {
    setSending(true);
    try {
      const result = await repo.sendFriendRequest(normalizeUsername(username));
      if (result.status === 'accepted') notify.success(`@${result.username} had already asked you. You are now friends.`);
      else notify.success(`Friend request sent to @${result.username}`);
      form.resetFields();
    } catch (error) {
      form.setFields([{ name: 'username', errors: [friendlyError(error)] }]);
    } finally {
      setSending(false);
      friends.reload();
    }
  };

  const remove = async (row, done) => {
    setBusyId(row.friendship_id);
    try {
      await repo.removeFriend(row.user_id);
      notify.success(done);
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setBusyId(null);
      friends.reload();
    }
  };

  const addToGroup = async (row, group) => {
    setBusyId(row.friendship_id);
    try {
      const added = await repo.addPersonByUsername(group.id, row.username);
      await workspace.actions.refreshGroup(group.id);
      notify.success(`${added.person_name} added to ${group.name}. They can open it once they accept the invitation.`);
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setBusyId(null);
    }
  };

  const groupMenu = (row) => ({
    items: ownGroups.length
      ? ownGroups.map((group) => ({ key: group.id, label: group.name }))
      : [{ key: 'none', label: 'You do not own any groups yet', disabled: true }],
    onClick: ({ key }) => {
      const group = ownGroups.find((item) => item.id === key);
      if (group) addToGroup(row, group);
    },
  });

  return (
    <>
      <PageIntro title="Friends" />
      <section className="page-panel friends-page">
        <Form form={form} layout="inline" requiredMark={false} onFinish={send} className="friend-request-form">
          <Form.Item
            name="username"
            label="Add a friend by username"
            rules={[{
              validator: (_, value) => {
                const problem = usernameProblem(normalizeUsername(value));
                return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
              },
            }]}
          >
            <Input prefix="@" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={21} placeholder="priya123" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={sending}>Send request</Button>
        </Form>
        <Paragraph type="secondary" className="friends-help">
          They become your friend only after they accept. Friends can be added to your groups in one click.
        </Paragraph>
        {friends.error && <Text type="danger" role="alert">{friends.error}</Text>}

        {friends.incoming.length > 0 && (
          <>
            <Title level={4}>Requests for you</Title>
            <List
              className="friends-list"
              dataSource={friends.incoming}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button key="accept" type="primary" size="small" loading={answering === row.friendship_id} disabled={Boolean(answering)} onClick={() => answer(row, true)}>
                      Accept
                    </Button>,
                    <Popconfirm
                      key="decline"
                      title={`Decline the friend request from @${row.username}?`}
                      description="They will not be able to ask again for 7 days."
                      okText="Decline"
                      onConfirm={() => answer(row, false)}
                    >
                      <Button size="small" disabled={Boolean(answering)}>Decline</Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta avatar={<FriendAvatar row={row} />} title={friendLabel(row)} description="Wants to be your friend" />
                </List.Item>
              )}
            />
          </>
        )}

        <Title level={4}>Your friends</Title>
        {friends.friends.length ? (
          <List
            className="friends-list"
            dataSource={friends.friends}
            renderItem={(row) => (
              <List.Item
                actions={[
                  <Dropdown key="add" menu={groupMenu(row)} trigger={['click']} disabled={Boolean(busyId)}>
                    <Button size="small" loading={busyId === row.friendship_id}>Add to group <DownOutlined /></Button>
                  </Dropdown>,
                  <Popconfirm
                    key="remove"
                    title={`Remove @${row.username} from your friends?`}
                    description="Groups you share are not changed."
                    okText="Remove"
                    onConfirm={() => remove(row, `@${row.username} removed from your friends`)}
                  >
                    <Button size="small" type="text" danger disabled={Boolean(busyId)}>Remove</Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta avatar={<FriendAvatar row={row} />} title={row.display_name || '@' + row.username} description={'@' + row.username} />
              </List.Item>
            )}
          />
        ) : (
          friends.loaded && (
            <Empty
              className="empty-panel"
              description="No friends yet. Send a request to someone's @username above."
            />
          )
        )}

        {friends.outgoing.length > 0 && (
          <>
            <Title level={4}>Waiting for an answer</Title>
            <List
              className="friends-list"
              dataSource={friends.outgoing}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button key="cancel" size="small" loading={busyId === row.friendship_id} disabled={Boolean(busyId)} onClick={() => remove(row, `Request to @${row.username} cancelled`)}>
                      Cancel request
                    </Button>,
                  ]}
                >
                  <List.Item.Meta avatar={<FriendAvatar row={row} />} title={friendLabel(row)} description="Request sent" />
                </List.Item>
              )}
            />
          </>
        )}
      </section>
    </>
  );
}
