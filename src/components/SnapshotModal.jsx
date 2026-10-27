import React from 'react';
import { Col, Empty, List, Modal, Row, Space, Statistic, Tag, Typography } from 'antd';
import { ArrowDownOutlined } from '@ant-design/icons';
import { formatCents } from '../lib/currency';

const { Text, Title } = Typography;

export default function SnapshotModal({ snapshot, onClose }) {
  const money = (cents) => formatCents(cents, snapshot?.currencyCode);
  return (
    <Modal
      title="Saved split details"
      open={Boolean(snapshot)}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
    >
      {snapshot && (
        <>
          <Space wrap>
            <Tag color="blue">{snapshot.groupName}</Tag>
            <Text type="secondary">Saved {new Date(snapshot.savedAt).toLocaleString()}</Text>
          </Space>
          <Row gutter={12} className="snapshot-summary">
            <Col span={8}>
              <Statistic title="Total expenses" value={snapshot.totalCents || 0} formatter={money} />
            </Col>
            <Col span={8}><Statistic title="People" value={snapshot.people?.length || 0} /></Col>
            <Col span={8}><Statistic title="Suggested payments" value={snapshot.settlements?.length || 0} /></Col>
          </Row>
          <Title level={5}>Expenses</Title>
          {snapshot.expenses?.length ? (
            <List
              dataSource={snapshot.expenses}
              renderItem={(expense) => (
                <List.Item>
                  <List.Item.Meta
                    title={expense.description}
                    description={`${expense.category || 'Other'} · Paid by ${expense.payer}`}
                  />
                  <Text strong>{money(expense.amountCents)}</Text>
                </List.Item>
              )}
            />
          ) : <Empty description="No expenses were in this saved split." />}
          <Title level={5}>Settle up</Title>
          {snapshot.settlements?.length ? snapshot.settlements.map((item, index) => (
            <div className="settlement-row" key={item.payer + item.payee + index}>
              <Text strong>{item.payer}</Text>
              <ArrowDownOutlined className="arrow-icon" />
              <Text strong>{item.payee}</Text>
              <Text strong className="settlement-amount">{money(item.amountCents)}</Text>
            </div>
          )) : <Text type="secondary">Everyone was settled up.</Text>}
        </>
      )}
    </Modal>
  );
}
