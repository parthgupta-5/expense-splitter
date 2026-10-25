import React from 'react';
import { Button, Col, Form, Input, InputNumber, Row, Select, Typography } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { DESCRIPTION_MAX, NOTE_MAX } from '../lib/limits';

const { Text, Title } = Typography;
const CATEGORIES = ['Food & drink', 'Travel', 'Stay', 'Groceries', 'Transport', 'Entertainment', 'Other'];
const SPLIT_TYPES = [
  { label: 'Equal', value: 'equal' },
  { label: 'Custom amounts', value: 'unequal' },
  { label: 'By shares', value: 'shares' },
  { label: 'Percentages', value: 'percentages' },
];
const EDITOR_TITLES = {
  unequal: 'Enter each person’s amount',
  shares: 'Set shares for each person',
  percentages: 'Set each person’s percentage',
};

function SplitEditor({ splitType, participants, values, currencySymbol, onChange }) {
  return (
    <div className="split-editor">
      <div className="split-editor-title"><Text strong>{EDITOR_TITLES[splitType]}</Text></div>
      <Row gutter={[12, 4]}>
        {participants.map((person) => (
          <Col xs={12} sm={8} md={6} key={person}>
            <Form.Item label={person}>
              <InputNumber
                min={0}
                precision={splitType === 'percentages' ? 2 : 3}
                suffix={{ percentages: '%', shares: 'shares' }[splitType]}
                prefix={splitType === 'unequal' ? currencySymbol : undefined}
                className="full-width"
                value={values[person] ?? (splitType === 'unequal' ? undefined : 0)}
                onChange={(value) => onChange(person, value)}
              />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default function ExpenseForm({ expenseForm, people, currencySymbol }) {
  const {
    form, splitType, splitValues, participants, editingIndex,
    reset, submit, changeSplitType, setSplitValue, changeParticipants,
  } = expenseForm;
  const options = people.map((person) => ({ label: person, value: person }));
  const editing = editingIndex !== null;

  return (
    <>
      <div className="section-heading">
        <div>
          <Text className="eyebrow">GROUP WORKSPACE</Text>
          <Title level={3}>{editing ? 'Edit expense' : 'Add an expense'}</Title>
        </div>
        <div className="step-pill">01 <span>·</span> ACTIVITY</div>
      </div>
      <Form form={form} layout="vertical" onFinish={submit} className="expense-form">
        <Row gutter={16}>
          <Col xs={24} md={7}>
            <Form.Item
              name="description"
              label="What was it for?"
              rules={[{ required: true, whitespace: true, message: 'Add a short description' }]}
            >
              <Input size="large" placeholder="Dinner, groceries, taxi…" maxLength={DESCRIPTION_MAX} showCount />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <Form.Item name="payer" label="Who paid?" rules={[{ required: true, message: 'Choose who paid' }]}>
              <Select size="large" placeholder="Select a person" options={options} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Form.Item name="amount" label="Total amount" rules={[{ required: true, message: 'Enter the total' }]}>
              <InputNumber
                size="large" min={0.01} precision={2} prefix={currencySymbol} placeholder="0.00" className="full-width"
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Form.Item name="category" label="Category" initialValue="Other">
              <Select size="large" options={CATEGORIES.map((value) => ({ label: value, value }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Form.Item label="Split method">
              <Select size="large" value={splitType} onChange={changeSplitType} options={SPLIT_TYPES} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label="Split between"
          validateStatus={participants.length ? undefined : 'error'}
          help={participants.length ? undefined : 'Choose at least one person'}
        >
          <Select
            mode="multiple"
            size="large"
            value={participants}
            onChange={changeParticipants}
            options={options}
            placeholder="Everyone"
            maxTagCount="responsive"
          />
        </Form.Item>
        <Form.Item name="note" label="Note (optional)">
          <Input placeholder="Add context for the group" maxLength={NOTE_MAX} />
        </Form.Item>
        {splitType !== 'equal' && (
          <SplitEditor
            splitType={splitType}
            participants={participants}
            values={splitValues}
            currencySymbol={currencySymbol}
            onChange={setSplitValue}
          />
        )}
        <div className="form-actions">
          <Button onClick={reset}>{editing ? 'Cancel editing' : 'Clear'}</Button>
          <Button type="primary" htmlType="submit" icon={editing ? <CheckOutlined /> : <PlusOutlined />}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </Form>
    </>
  );
}
