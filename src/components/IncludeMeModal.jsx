import React, { useState } from 'react';
import {
  Button, Modal, Radio, Select, Space, Typography,
} from 'antd';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { personLabel } from '../lib/people';

const { Paragraph } = Typography;

/**
 * The owner of a group made before owners were added automatically (or who took themselves out) adds themselves as a
 * new person, or says which existing guest they already are, which links that guest to their account. Nothing else
 * about the group or its balances changes.
 */
export default function IncludeMeModal({
  open, group, guests, onClose, onChanged,
}) {
  const { workspace, notify } = useApp();
  const [choice, setChoice] = useState('new');
  const [personId, setPersonId] = useState(null);
  const [busy, setBusy] = useState(false);
  const label = personLabel(workspace.profile);

  const save = async () => {
    setBusy(true);
    try {
      const result = await repo.addMeToGroup(group.id, choice === 'existing' ? personId : null);
      notify.success(`You are in ${group.name} as ${result.person_name}`);
      await onChanged();
      onClose();
    } catch (error) {
      notify.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add yourself to this group" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <Paragraph type="secondary">
        Then you can be the one who paid, and share in expenses. Existing expenses and balances do not change.
      </Paragraph>
      <Radio.Group value={choice} onChange={(event) => setChoice(event.target.value)} className="include-me-choice">
        <Space orientation="vertical">
          <Radio value="new">Add me as {label}</Radio>
          {guests.length > 0 && <Radio value="existing">I am already in the list</Radio>}
        </Space>
      </Radio.Group>
      {choice === 'existing' && (
        <Select
          className="include-me-select"
          placeholder="Choose who you are"
          aria-label="Who you are in this group"
          value={personId}
          onChange={setPersonId}
          options={guests.map((guest) => ({ value: guest.id, label: guest.name }))}
        />
      )}
      <div className="include-me-actions">
        <Button type="primary" loading={busy} disabled={choice === 'existing' && !personId} onClick={save}>
          {choice === 'existing' ? 'Link me' : 'Add me'}
        </Button>
      </div>
    </Modal>
  );
}
