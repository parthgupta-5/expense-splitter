import React from 'react';
import { Button, Empty, Popconfirm, Table, Typography } from 'antd';
import { DeleteOutlined, SwapOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function PaymentsTable({ payments, formatMoney, onDelete }) {
  const columns = [
    { title: 'From', dataIndex: 'payer', key: 'payer', render: (value) => <Text strong>{value}</Text> },
    { title: '', key: 'arrow', render: () => <SwapOutlined className="muted-icon" /> },
    { title: 'To', dataIndex: 'payee', key: 'payee', render: (value) => <Text strong>{value}</Text> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: formatMoney },
    {
      title: '',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <Popconfirm title="Remove this payment?" onConfirm={() => onDelete(record.id)}>
          <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove payment" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Table
      size="middle"
      rowKey="id"
      columns={columns}
      dataSource={payments}
      pagination={{ pageSize: 5, hideOnSinglePage: true }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments recorded yet." /> }}
    />
  );
}
