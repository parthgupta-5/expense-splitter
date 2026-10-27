import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button, Form, Input, Modal, Select,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { CURRENCIES, DEFAULT_CURRENCY } from '../lib/currency';
import { GROUP_NAME_MAX } from '../lib/limits';
import { groupPath } from '../lib/groupSlug';

export const groupNameRules = [
  { required: true, whitespace: true, message: 'Add a group name' },
  { max: GROUP_NAME_MAX, message: 'Use at most ' + GROUP_NAME_MAX + ' characters' },
];

export default function GroupModal() {
  const {
    workspace, notify, groupDialogOpen, closeGroupDialog,
  } = useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const create = async ({ name, currencyCode }) => {
    setBusy(true);
    const group = await workspace.actions.createGroup(name, currencyCode);
    setBusy(false);
    if (!group) return;
    form.resetFields();
    closeGroupDialog();
    notify.success(group.name + ' created');
    navigate(groupPath(group, [...workspace.groups, group]));
  };

  return (
    <Modal title="Create a group" open={groupDialogOpen} onCancel={closeGroupDialog} footer={null} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        className="group-create-form"
        onFinish={create}
        initialValues={{ currencyCode: workspace.preferences.currency || DEFAULT_CURRENCY }}
      >
        <Form.Item name="name" label="Group name" rules={groupNameRules}>
          <Input autoFocus placeholder="Weekend in Goa" maxLength={GROUP_NAME_MAX} showCount />
        </Form.Item>
        <Form.Item name="currencyCode" label="Currency">
          <Select options={CURRENCIES} />
        </Form.Item>
        <Button type="primary" block htmlType="submit" icon={<PlusOutlined />} loading={busy}>Create group</Button>
      </Form>
    </Modal>
  );
}
