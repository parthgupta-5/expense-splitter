import React, { useState } from 'react';
import {
  Button, Modal, Popconfirm, Space, Typography,
} from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';

const { Paragraph } = Typography;

/** After signing in: offers to move groups made while signed out on this device into the account. */
export default function ImportGuestModal() {
  const { workspace, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const groups = workspace.guestToImport;
  const open = workspace.mode === 'cloud' && workspace.status === 'ready' && groups.length > 0;

  const importAll = async () => {
    setBusy(true);
    const { imported, failed } = await workspace.actions.importGuestGroups(groups);
    setBusy(false);
    if (imported.length) notify.success(imported.length + ' group(s) moved into your account');
    if (failed.length) {
      notify.error('Could not move: ' + failed.map((item) => item.group.name + ' (' + item.message + ')').join(', ')
        + '. They are still saved on this device.');
    }
  };

  return (
    <Modal
      title="Keep the groups from this device?"
      open={open}
      closable={false}
      mask={{ closable: false }}
      footer={null}
    >
      <Paragraph>
        You made {groups.length === 1 ? 'this group' : 'these groups'} before signing in. Move{' '}
        {groups.length === 1 ? 'it' : 'them'} into your account to keep {groups.length === 1 ? 'it' : 'them'} on every
        device and share with friends.
      </Paragraph>
      <ul className="import-list">
        {groups.map((group) => (
          <li key={group.id}>
            <strong>{group.name}</strong> · {group.people.length} people, {group.expenses.length} expenses
          </li>
        ))}
      </ul>
      <Space wrap style={{ marginTop: 16 }}>
        <Button type="primary" icon={<CloudUploadOutlined />} loading={busy} onClick={importAll}>
          Move to my account
        </Button>
        <Button disabled={busy} onClick={() => workspace.actions.dismissGuestImport()}>Not now</Button>
        <Popconfirm
          title="Delete these groups from this device?"
          description="This cannot be undone."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() => workspace.actions.dismissGuestImport({ discard: true })}
        >
          <Button danger type="text" disabled={busy}>Delete from this device</Button>
        </Popconfirm>
      </Space>
    </Modal>
  );
}
