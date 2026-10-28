import React, { useState } from 'react';
import {
  Button, Empty, Pagination, Popconfirm, Tooltip,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

const PAGE_SIZE = 8;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');

/** Repayments already recorded: "Ben paid Asha", when, the amount, and Remove. */
export default function PaymentList({ payments, formatMoney, onDelete }) {
  const [page, setPage] = useState(1);

  if (!payments.length) {
    return (
      <Empty
        className="list-empty"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No payments recorded yet. When someone pays another person back, record it under Balances."
      />
    );
  }

  const current = Math.min(page, Math.ceil(payments.length / PAGE_SIZE));
  const shown = payments.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <>
      <ul className="money-list" aria-label="Payments">
        {shown.map((payment) => (
          <li key={payment.id} className="money-row payment-row">
            <span className="money-row-main">
              <span className="money-row-title"><strong>{payment.payer}</strong> paid <strong>{payment.payee}</strong></span>
              {payment.createdAt && <span className="money-row-meta">{day(payment.createdAt)}</span>}
            </span>
            <span className="money-row-amount">{formatMoney(payment.amountCents)}</span>
            <span className="money-row-actions">
              <Popconfirm title="Remove this payment?" okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => onDelete(payment.id)}>
                <Tooltip title="Remove">
                  <Button
                    type="text"
                    danger
                    aria-label={`Remove payment from ${payment.payer} to ${payment.payee}`}
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            </span>
          </li>
        ))}
      </ul>
      <Pagination
        className="money-list-pages"
        size="small"
        current={current}
        pageSize={PAGE_SIZE}
        total={payments.length}
        onChange={setPage}
        hideOnSinglePage
        showSizeChanger={false}
      />
    </>
  );
}
