import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Form, Input, Modal, Popconfirm, Select, Typography,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { CURRENCIES } from '../lib/currency';
import { GROUP_NAME_MAX } from '../lib/limits';
import { groupNameRules } from './GroupModal';

const { Text } = Typography;

/** Rename a group, change its currency, or delete it (owner) / leave it (member). */
export default function GroupSettingsModal({ group, open, onClose }) {
  const { workspace, notify } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const canDelete = !group?.cloud || group.role === 'owner';

  const save = async ({ name, currencyCode }) => {
    setBusy(true);
    const ok = await workspace.actions.updateGroup(group.id, { name, currencyCode });
    setBusy(false);
    if (ok) { notify.success('Group updated'); onClose(); }
  };

  const remove = async () => {
    const ok = canDelete
      ? await workspace.actions.deleteGroup(group.id)
      : await workspace.actions.leaveGroup(group.id);
    if (!ok) return;
    notify.success(canDelete ? 'Group deleted' : 'You left ' + group.name);
    onClose();
    navigate('/groups');
  };

  return (
    <Modal title="Group settings" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      {group && (
        <Form
          layout="vertical"
          onFinish={save}
          initialValues={{ name: group.name, currencyCode: group.currencyCode }}
        >
          <Form.Item name="name" label="Group name" rules={groupNameRules}>
            <Input maxLength={GROUP_NAME_MAX} showCount />
          </Form.Item>
          <Form.Item
            name="currencyCode"
            label="Currency"
            extra="Changes the symbol and number format only. Amounts are not converted."
          >
            <Select options={CURRENCIES} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>Save changes</Button>
          <div className="danger-zone">
            <Text type="secondary">
              {canDelete ? 'Deleting removes every expense and payment in this group.' : 'Leaving removes your access to this group.'}
            </Text>
            <Popconfirm
              title={canDelete ? 'Delete ' + group.name + '?' : 'Leave ' + group.name + '?'}
              description={canDelete && group.memberCount > 1 ? 'It will be deleted for every member.' : undefined}
              okButtonProps={{ danger: true }}
              okText={canDelete ? 'Delete' : 'Leave'}
              onConfirm={remove}
            >
              <Button danger icon={<DeleteOutlined />}>{canDelete ? 'Delete group' : 'Leave group'}</Button>
            </Popconfirm>
          </div>
        </Form>
      )}
    </Modal>
  );
}
