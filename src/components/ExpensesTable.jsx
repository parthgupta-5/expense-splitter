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
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" className="mobile-meta">{record.category || 'Other'} · Paid by {record.payer}</Text>
        </Space>
      ),
    },
    { title: 'Paid by', dataIndex: 'payer', key: 'payer', responsive: ['sm'] },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (value) => <Text strong>{formatMoney(value)}</Text>,
    },
    {
      title: 'Split by person',
      dataIndex: 'splitDetails',
      key: 'splitDetails',
      render: (split, record) => (
        <div className="split-list">
          <Tag color="blue">{SPLIT_LABELS[record.splitType] || 'Equal'}</Tag>
          {Object.entries(split || {}).map(([name, value]) => (
            <span className="split-person" key={name}>
              <span>{name}</span>
              <Text strong>{formatMoney(value)}</Text>
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
            <Button type="text" aria-label="Edit expense" icon={<EditOutlined />} onClick={() => onEdit(record._index)} />
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
      dataSource={expenses.map((expense, index) => ({ ...expense, _index: index }))}
      pagination={{ pageSize: 6, hideOnSinglePage: true }}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No expenses yet. Add the first one above." />,
      }}
      scroll={{ x: 660 }}
    />
  );
}
