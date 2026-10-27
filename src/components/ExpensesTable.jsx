import React from 'react';
import { Button, Empty, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

const { Text } = Typography;
const SPLIT_LABELS = { unequal: 'Custom', percentages: 'Percentages', shares: 'Shares' };

export default function ExpensesTable({ expenses, formatMoney, onEdit, onDelete }) {
  const columns = [
    {
      title: 'Expense',
      dataIndex: 'description',
      key: 'description',
      render: (value, record) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" className="mobile-meta">{record.category || 'Other'} · Paid by {record.payer}</Text>
        </Space>
      ),
    },
    { title: 'Paid by', dataIndex: 'payer', key: 'payer', responsive: ['sm'] },
    {
      title: 'Amount',
      dataIndex: 'amountCents',
      key: 'amount',
      align: 'right',
      className: 'cell-nowrap',
      render: (cents) => <Text strong>{formatMoney(cents)}</Text>,
    },
    {
      title: 'Split by person',
      dataIndex: 'splitCents',
      key: 'split',
      render: (split, record) => (
        <div className="split-list">
          <Tag color="blue">{SPLIT_LABELS[record.splitType] || 'Equal'}</Tag>
          {Object.entries(split || {}).map(([name, cents]) => (
            <span className="split-person" key={name}>
              <span>{name}</span>
              <Text strong>{formatMoney(cents)}</Text>
            </span>
          ))}
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" aria-label="Edit expense" icon={<EditOutlined />} onClick={() => onEdit(record.id)} />
          </Tooltip>
          <Popconfirm title="Delete this expense?" onConfirm={() => onDelete(record.id)}>
            <Tooltip title="Delete">
              <Button type="text" danger aria-label="Delete expense" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table
      size="middle"
      rowKey="id"
      columns={columns}
      dataSource={expenses}
      pagination={{ pageSize: 6, hideOnSinglePage: true }}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No expenses yet. Add the first one above." />,
      }}
      scroll={{ x: 660 }}
    />
  );
}
