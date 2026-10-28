import React from 'react';
import { Avatar, Button, Table } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { balanceText } from '../lib/settlementText';

/**
 * Each person's net position in words ("Owes ₹150.00"), the suggested settle-up plan ("Ben pays Asha ₹300.00") with
 * Copy settlement, then the form for recording a payment (`paymentForm`). Nothing depends on a sign or a colour alone.
 */
export default function BalancesPanel({
  balances, settlements, formatMoney, onCopy, paymentForm,
}) {
  const columns = [
    {
      title: 'Person',
      dataIndex: 'name',
      key: 'name',
      render: (name) => (
        <span className="balance-person"><Avatar size="small">{name.slice(0, 1).toUpperCase()}</Avatar><strong>{name}</strong></span>
      ),
    },
    {
      title: 'Paid', dataIndex: 'paidCents', key: 'paid', align: 'right', className: 'cell-nowrap', responsive: ['sm'], render: formatMoney,
    },
    {
      title: 'Their share', dataIndex: 'shareCents', key: 'share', align: 'right', className: 'cell-nowrap', responsive: ['sm'], render: formatMoney,
    },
    {
      title: 'Balance',
      dataIndex: 'balanceCents',
      key: 'balance',
      align: 'right',
      className: 'cell-nowrap',
      render: (cents) => <span className={'balance-text' + (cents === 0 ? ' is-settled' : '')}>{balanceText(cents, formatMoney)}</span>,
    },
  ];
  const count = settlements.length;

  return (
    <>
      <Table
        size="middle"
        rowKey="name"
        columns={columns}
        dataSource={Object.entries(balances).map(([name, values]) => ({ name, ...values }))}
        pagination={false}
        className="balances-table"
      />
      <section className="settlement-box" aria-labelledby="settle-up-heading">
        <div className="settlement-heading">
          <div>
            <h3 id="settle-up-heading">Settle up</h3>
            <span className="settlement-count">
              {count ? `${count} suggested ${count === 1 ? 'payment' : 'payments'}` : 'Everyone is settled up.'}
            </span>
          </div>
          <Button size="small" icon={<CopyOutlined />} onClick={onCopy}>Copy settlement</Button>
        </div>
        {count > 0 && (
          <ol className="settlement-list">
            {settlements.map((item, index) => (
              <li className="settlement-row" key={item.payer + item.payee + index}>
                <strong>{item.payer}</strong>
                <span className="settlement-verb">pays</span>
                <strong>{item.payee}</strong>
                <strong className="settlement-amount">{formatMoney(item.amountCents)}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>
      {paymentForm}
    </>
  );
}
