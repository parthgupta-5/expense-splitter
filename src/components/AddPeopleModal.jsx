import React, { useState } from 'react';
import {
  Alert, Button, Form, Input, Modal, Segmented, Typography,
} from 'antd';
import { LoginOutlined, SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import UserAvatar from './UserAvatar';
import { memberAvatarSrc } from '../lib/avatarUrl';
import { friendlyError } from '../lib/errors';
import { PERSON_NAME_MAX } from '../lib/limits';
import { inviteeOutcome } from '../lib/people';
import { USERNAME_RULES, normalizeUsername, usernameProblem } from '../lib/username';
import { supabaseUrl } from '../supabase';

const { Paragraph, Text } = Typography;

const usernameRule = {
  required: true,
  // Only the format is checked here; whether the account exists is the server's answer.
  validator: (_, value) => {
    if (!value) return Promise.reject(new Error('Enter their username'));
    return usernameProblem(normalizeUsername(value)) === USERNAME_RULES
      ? Promise.reject(new Error(USERNAME_RULES))
      : Promise.resolve();
  },
};

/**
 * Find an account by its exact @username (public details only), then add it as a person and send the invitation in
 * one step, or (`linkPerson`) invite it to become an existing guest. The database checks every rule again.
 */
function ByUsername({ group, linkPerson, onDone }) {
  const { notify } = useApp();
  const [form] = Form.useForm();
  const [result, setResult] = useState(null);
  const [finding, setFinding] = useState(false);
  const [adding, setAdding] = useState(false);
  const outcome = result ? inviteeOutcome(result, { linking: Boolean(linkPerson), rules: USERNAME_RULES }) : null;

  const find = async ({ username }) => {
    setFinding(true);
    setResult(null);
    try {
      setResult(await repo.findInvitee(group.id, normalizeUsername(username)));
    } catch (error) {
      form.setFields([{ name: 'username', errors: [friendlyError(error)] }]);
    } finally {
      setFinding(false);
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      if (linkPerson) {
        const sent = await repo.inviteByUsername(group.id, linkPerson.id, result.username);
        notify.success(`Invitation sent to @${sent.username} to join as ${sent.person_name}`);
      } else {
        const added = await repo.addPersonByUsername(group.id, result.username);
        notify.success(`${added.person_name} added. Invitation sent to @${added.username}.`);
      }
      await onDone();
    } catch (error) {
      setResult((current) => ({ ...current, failure: friendlyError(error) }));
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Paragraph type="secondary">
        {linkPerson
          ? `Invite an account to be ${linkPerson.name}. Their expenses stay the same; once they accept, they can open this group.`
          : 'They get an invitation in their notifications. You can include them in expenses straight away; they can open the group once they accept.'}
      </Paragraph>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={find}
        onValuesChange={() => setResult(null)}
        className="find-person-form"
      >
        <Form.Item name="username" label="Their username" rules={[usernameRule]}>
          <Input prefix="@" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={21} placeholder="priya123" autoFocus />
        </Form.Item>
        <Button htmlType="submit" icon={<SearchOutlined />} loading={finding}>Find</Button>
      </Form>
      {result && (
        <div className="invitee-card" role="status" aria-live="polite">
          {result.username && (
            <UserAvatar
              name={result.display_name || result.username}
              seed={result.username}
              size={44}
              src={memberAvatarSrc(result.avatar_url, supabaseUrl)}
            />
          )}
          <div className="invitee-copy">
            {result.username && (
              <span className="invitee-name">
                <Text strong>{result.display_name || '@' + result.username}</Text>
                {result.display_name && <Text type="secondary"> @{result.username}</Text>}
              </span>
            )}
            <Text type={outcome.canAdd ? undefined : 'secondary'}>{outcome.text}</Text>
            {result.failure && <Text type="danger" role="alert">{result.failure}</Text>}
          </div>
        </div>
      )}
      {outcome?.canAdd && (
        <Button type="primary" block icon={<UserAddOutlined />} loading={adding} onClick={add} className="invitee-add">
          {linkPerson ? 'Send invitation' : 'Add and send invitation'}
        </Button>
      )}
    </>
  );
}

/** A guest is only a name in the expenses: no account, no invitation, no access, no emails. */
function AsGuest({ onAddGuests }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const submit = async ({ name }) => {
    setBusy(true);
    const added = await onAddGuests(name);
    setBusy(false);
    if (added) form.resetFields();
  };
  return (
    <>
      <Paragraph type="secondary">
        A guest is a name in this group&apos;s expenses. Guests get no invitation and no emails, and cannot sign in to
        see the group.
      </Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} className="add-guest-form">
        <Form.Item name="name" label="Guest name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input maxLength={PERSON_NAME_MAX} placeholder="Priya" autoComplete="off" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={busy}>Add guest</Button>
      </Form>
    </>
  );
}

/**
 * "Add people": exactly two choices. Add by username (signed-in groups, owner only, because it sends an invitation)
 * and Add guest (anyone who can edit the group). `linkPerson` opens straight to inviting an account for that guest.
 */
export default function AddPeopleModal({
  open, group, cloud, isOwner, initialMode = 'guest', linkPerson = null, onClose, onAddGuests, onChanged,
}) {
  const { openAuth } = useApp();
  const [mode, setMode] = useState(linkPerson ? 'username' : initialMode);
  const done = async () => { await onChanged(); onClose(); };

  let usernamePane;
  if (!cloud) {
    usernamePane = (
      <>
        <Paragraph type="secondary">
          Adding someone by username sends them an invitation, so it needs an account. Sign in to share this group, or
          add them as a guest.
        </Paragraph>
        <Button icon={<LoginOutlined />} onClick={() => { onClose(); openAuth('signin'); }}>Sign in or create an account</Button>
      </>
    );
  } else if (!isOwner) {
    usernamePane = <Alert type="info" showIcon title="Only the group owner can add people by username. You can still add a guest." />;
  } else {
    usernamePane = <ByUsername group={group} linkPerson={linkPerson} onDone={done} />;
  }

  return (
    <Modal
      title={linkPerson ? `Invite an account for ${linkPerson.name}` : 'Add people'}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      className="add-people-modal"
    >
      {!linkPerson && (
        <Segmented
          block
          value={mode}
          onChange={setMode}
          className="add-people-choice"
          aria-label="How to add someone"
          options={[{ label: 'Add by username', value: 'username' }, { label: 'Add guest', value: 'guest' }]}
        />
      )}
      <div className="add-people-pane">
        {mode === 'username' ? usernamePane : <AsGuest onAddGuests={onAddGuests} />}
      </div>
    </Modal>
  );
}
