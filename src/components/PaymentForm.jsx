import React from 'react';
import { Button, Divider, Form, InputNumber, Modal, Select } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { paymentExceedsOwed } from '../lib/splits';
import { makeId } from '../lib/storage';

export default function PaymentForm({ people, balances, currencySymbol, onAddPayment, messageApi }) {
  const [form] = Form.useForm();
  const options = people.map((person) => ({ label: person, value: person }));

  const save = (values) => {
    onAddPayment({ ...values, id: makeId(), amount: Number(values.amount), createdAt: new Date().toISOString() });
    form.resetFields();
    messageApi.success('Payment recorded');
  };

  const record = (values) => {
    if (values.payer === values.payee) { messageApi.error('Choose two different people'); return; }
    if (!paymentExceedsOwed(balances, values.payer, values.payee, Number(values.amount))) { save(values); return; }
    Modal.confirm({
      title: 'This is more than the current balance',
      content: values.payer + ' does not currently owe ' + values.payee
        + ' this much. Recording it will flip the balance. Record anyway?',
      okText: 'Record anyway',
      onOk: () => save(values),
    });
  };

  return (
    <>
      <Divider orientation="left" plain>Record a payment</Divider>
      <div className="payment-entry">
        <Form form={form} layout="inline" onFinish={record} className="payment-form">
          <Form.Item name="payer" rules={[{ required: true, message: 'Choose who paid' }]}>
            <Select placeholder="From" options={options} className="payment-select" />
          </Form.Item>
          <SwapOutlined className="muted-icon payment-swap" />
          <Form.Item name="payee" rules={[{ required: true, message: 'Choose who received it' }]}>
            <Select placeholder="To" options={options} className="payment-select" />
          </Form.Item>
          <Form.Item name="amount" rules={[{ required: true, message: 'Enter an amount' }]}>
            <InputNumber min={0.01} precision={2} prefix={currencySymbol} placeholder="Amount" className="payment-amount" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" ghost>Record payment</Button></Form.Item>
        </Form>
      </div>
    </>
  );
}
