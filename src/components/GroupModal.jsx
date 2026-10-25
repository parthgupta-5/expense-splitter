import React from 'react';
import { Button, Form, Input, Modal } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { GROUP_NAME_MAX } from '../lib/limits';

export default function GroupModal({ open, onClose, onCreate }) {
  const [form] = Form.useForm();
  return (
    <Modal title="Create a group" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        className="group-create-form"
        onFinish={(values) => { if (onCreate(values.name)) form.resetFields(); }}
      >
        <Form.Item
          name="name"
          label="Group name"
          rules={[
            { required: true, whitespace: true, message: 'Add a group name' },
            { max: GROUP_NAME_MAX, message: 'Use at most ' + GROUP_NAME_MAX + ' characters' },
          ]}
        >
          <Input autoFocus placeholder="Weekend in Goa" maxLength={GROUP_NAME_MAX} showCount />
        </Form.Item>
        <Button type="primary" block htmlType="submit" icon={<PlusOutlined />}>Create group</Button>
      </Form>
    </Modal>
  );
}
