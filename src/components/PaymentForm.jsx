import React from 'react';
import { Button, Divider, Form, InputNumber, Select } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { paymentExceedsOwed } from '../lib/splits';
import { makeId } from '../lib/storage';

/** Records a repayment between two people. `onAddPayment` resolves to true when the payment was kept. */
export default function PaymentForm({ people, balances, currencySymbol, onAddPayment, notify, modal }) {
  const [form] = Form.useForm();
  const options = people.map((person) => ({ label: person, value: person }));

  const save = async (values) => {
    const kept = await onAddPayment({
      payer: values.payer,
      payee: values.payee,
      id: makeId(),
      amount: Number(values.amount),
      createdAt: new Date().toISOString(),
    });
    if (!kept) return;
    form.resetFields();
    notify.success('Payment recorded');
  };

  const record = (values) => {
    if (values.payer === values.payee) { notify.error('Choose two different people'); return; }
    if (!paymentExceedsOwed(balances, values.payer, values.payee, Number(values.amount))) { save(values); return; }
    modal.confirm({
      title: 'This is more than the current balance',
      content: values.payer + ' does not currently owe ' + values.payee
        + ' this much. Recording it will flip the balance. Record anyway?',
      okText: 'Record anyway',
      onOk: () => save(values),
    });
  };

  return (
    <>
      <Divider titlePlacement="start" plain>Record a payment</Divider>
      <div className="payment-entry">
        <Form form={form} layout="inline" onFinish={record} className="payment-form" aria-label="Record a payment">
          <Form.Item name="payer" rules={[{ required: true, message: 'Choose who paid' }]}>
            <Select placeholder="From" options={options} className="payment-select" aria-label="Payment from" />
          </Form.Item>
          <SwapOutlined className="muted-icon payment-swap" aria-hidden="true" />
          <Form.Item name="payee" rules={[{ required: true, message: 'Choose who received it' }]}>
            <Select placeholder="To" options={options} className="payment-select" aria-label="Payment to" />
          </Form.Item>
          <Form.Item name="amount" rules={[{ required: true, message: 'Enter an amount' }]}>
            <InputNumber
              min={0.01} precision={2} prefix={currencySymbol} placeholder="Amount" className="payment-amount"
              aria-label="Payment amount"
            />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" ghost>Record payment</Button></Form.Item>
        </Form>
      </div>
    </>
  );
}
