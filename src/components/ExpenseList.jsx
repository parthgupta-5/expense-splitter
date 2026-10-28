import React, { useState } from 'react';
import {
  Button, Empty, Pagination, Popconfirm, Tooltip,
} from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

const PAGE_SIZE = 8;
const SPLIT_LABELS = {
  equal: 'Split equally', unequal: 'Custom amounts', shares: 'By shares', percentages: 'By percentages',
};

/** "Food & drink · Paid by Asha · Split equally": who paid, never who typed it in (that is in the History). */
export const expenseSubtitle = (expense) => [
  expense.category || 'Other',
  'Paid by ' + expense.payer,
  SPLIT_LABELS[expense.splitType] || SPLIT_LABELS.equal,
].join(' · ');

/**
 * The group's expenses as compact rows: what it was for, a short subtitle, each person's share, the amount on the right,
 * then Edit and Delete. People are shown by the name they have in the group (no @usernames in ordinary rows).
 */
export default function ExpenseList({
  expenses, formatMoney, onEdit, onDelete, onAdd,
}) {
  const [page, setPage] = useState(1);

  if (!expenses.length) {
    return (
      <Empty
        className="list-empty"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No expenses yet. Record the first one (dinner, a taxi, the rent) and the balances appear here."
      >
        {onAdd && <Button onClick={onAdd}>Add an expense</Button>}
      </Empty>
    );
  }

  const current = Math.min(page, Math.ceil(expenses.length / PAGE_SIZE));
  const shown = expenses.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <>
      <ul className="money-list" aria-label="Expenses">
        {shown.map((expense) => {
          const shares = Object.entries(expense.splitCents || {}).filter(([, cents]) => cents > 0);
          return (
            <li key={expense.id} className="money-row expense-row">
              <span className="money-row-main">
                <span className="money-row-title">{expense.description}</span>
                <span className="money-row-meta">{expenseSubtitle(expense)}</span>
                {shares.length > 0 && (
                  <span className="money-row-shares">
                    {shares.map(([name, cents]) => (
                      <span className="split-person" key={name}>{name} {formatMoney(cents)}</span>
                    ))}
                  </span>
                )}
              </span>
              <span className="money-row-amount">{formatMoney(expense.amountCents)}</span>
              <span className="money-row-actions">
                <Tooltip title="Edit">
                  <Button type="text" aria-label={'Edit ' + expense.description} icon={<EditOutlined />} onClick={() => onEdit(expense.id)} />
                </Tooltip>
                <Popconfirm title="Delete this expense?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => onDelete(expense.id)}>
                  <Tooltip title="Delete">
                    <Button type="text" danger aria-label={'Delete ' + expense.description} icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </span>
            </li>
          );
        })}
      </ul>
      <Pagination
        className="money-list-pages"
        size="small"
        current={current}
        pageSize={PAGE_SIZE}
        total={expenses.length}
        onChange={setPage}
        hideOnSinglePage
        showSizeChanger={false}
      />
    </>
  );
}
