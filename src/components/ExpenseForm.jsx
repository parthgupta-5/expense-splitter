import React from 'react';
import { Button, Col, Form, Input, InputNumber, Row, Select, Typography } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { DESCRIPTION_MAX, NOTE_MAX } from '../lib/limits';
import { parseMoneyInput } from '../lib/money';
import MoneyInput, { moneyRules } from './MoneyInput';

const { Text, Title } = Typography;
const CATEGORIES = ['Food & drink', 'Travel', 'Stay', 'Groceries', 'Transport', 'Entertainment', 'Other'];
const DEFAULT_SPLIT = 'equal';
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

/** The split method's name, with a small "default" note next to Equal (in the list and once chosen). */
const splitTypeLabel = (label, value) => (
  <span className="split-type-label">
    {label}
    {value === DEFAULT_SPLIT && <Text type="secondary" className="split-type-default">default</Text>}
  </span>
);

function SplitEditor({ splitType, participants, values, currencySymbol, onChange }) {
  return (
    <div className="split-editor">
      <div className="split-editor-title"><Text strong>{EDITOR_TITLES[splitType]}</Text></div>
      <Row gutter={[12, 4]}>
        {participants.map((person, index) => {
          const id = 'split-value-' + index;
          // Custom amounts are money: typed text, checked here as the user types and turned into cents on save.
          const problem = splitType === 'unequal' && String(values[person] ?? '').trim()
            ? parseMoneyInput(values[person], { allowZero: true }).error
            : null;
          return (
            <Col xs={12} sm={8} md={6} key={person}>
              <Form.Item label={person} htmlFor={id} validateStatus={problem ? 'error' : undefined} help={problem}>
                {splitType === 'unequal' ? (
                  <MoneyInput
                    id={id}
                    prefix={currencySymbol}
                    placeholder="0.00"
                    value={values[person] ?? ''}
                    onChange={(event) => onChange(person, event.target.value)}
                  />
                ) : (
                  <InputNumber
                    id={id}
                    min={0}
                    precision={splitType === 'percentages' ? 2 : 3}
                    suffix={{ percentages: '%', shares: 'shares' }[splitType]}
                    className="full-width"
                    value={values[person] ?? 0}
                    onChange={(value) => onChange(person, value)}
                  />
                )}
              </Form.Item>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}

export default function ExpenseForm({ expenseForm, people, currencySymbol }) {
  const {
    form, splitType, splitValues, participants, editingId, saving,
    reset, submit, changeSplitType, setSplitValue, changeParticipants,
  } = expenseForm;
  const options = people.map((person) => ({ label: person, value: person }));
  const editing = editingId !== null;

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
            <Form.Item name="amount" label="Total amount" rules={moneyRules('Enter the total')}>
              <MoneyInput size="large" prefix={currencySymbol} placeholder="0.00" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Form.Item name="category" label="Category" initialValue="Other">
              <Select size="large" options={CATEGORIES.map((value) => ({ label: value, value }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Form.Item label="Split method" htmlFor="split-method" required>
              <Select
                id="split-method"
                size="large"
                value={splitType}
                onChange={changeSplitType}
                options={SPLIT_TYPES}
                optionRender={(option) => splitTypeLabel(option.label, option.value)}
                labelRender={({ label, value }) => splitTypeLabel(label, value)}
                aria-required="true"
              />
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
          <Button type="primary" htmlType="submit" loading={saving} icon={editing ? <CheckOutlined /> : <PlusOutlined />}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </Form>
    </>
  );
}
