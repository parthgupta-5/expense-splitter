import React from 'react';
import { Avatar, Space, Table, Tag, Typography } from 'antd';
import { ArrowDownOutlined, CheckCircleFilled } from '@ant-design/icons';
import { SETTLE_EPSILON } from '../lib/splits';

const { Text, Title } = Typography;

export default function BalancesPanel({ balances, settlements, formatMoney }) {
  const columns = [
    {
      title: 'Person',
      dataIndex: 'name',
      key: 'name',
      render: (name) => (
        <Space><Avatar size="small">{name.slice(0, 1).toUpperCase()}</Avatar><Text strong>{name}</Text></Space>
      ),
    },
    { title: 'Their share', dataIndex: 'share', key: 'share', align: 'right', className: 'cell-nowrap', render: formatMoney },
    { title: 'Paid', dataIndex: 'paid', key: 'paid', align: 'right', className: 'cell-nowrap', render: formatMoney },
    {
      title: 'Net balance',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      className: 'cell-nowrap',
      render: (value) => {
        const tone = value > SETTLE_EPSILON ? 'positive' : value < -SETTLE_EPSILON ? 'negative' : '';
        return <Text className={tone} strong>{value > SETTLE_EPSILON ? '+' : ''}{formatMoney(value)}</Text>;
      },
    },
  ];

  return (
    <>
      <Table
        size="middle"
        rowKey="name"
        columns={columns}
        dataSource={Object.entries(balances).map(([name, values]) => ({ name, ...values }))}
        pagination={false}
      />
      {settlements.length > 0 && (
        <div className="settlement-box">
          <div className="settlement-heading">
            <div><Title level={5}>Settle up</Title></div>
            <Tag color="green" icon={<CheckCircleFilled />}>{settlements.length} suggested payments</Tag>
          </div>
          {settlements.map((item, index) => (
            <div className="settlement-row" key={item.payer + item.payee + index}>
              <Avatar size="small" className="settlement-avatar">{item.payer.slice(0, 1).toUpperCase()}</Avatar>
              <Text strong>{item.payer}</Text>
              <ArrowDownOutlined className="arrow-icon" />
              <Text strong>{item.payee}</Text>
              <Text strong className="settlement-amount">{formatMoney(item.amount)}</Text>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
