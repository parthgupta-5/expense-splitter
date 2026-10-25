import React from 'react';
import {
  Alert, Button, Card, Col, Divider, Empty, Popconfirm, Row, Space, Spin, Tag, Timeline, Typography,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, HistoryOutlined, LoginOutlined } from '@ant-design/icons';
import { collectActivity, collectSnapshots } from '../lib/history';
import { formatCurrency } from '../lib/currency';

const { Text, Title } = Typography;

function AccountGate({ onSignIn }) {
  return (
    <section className="page-panel account-gate">
      <div className="gate-icon"><HistoryOutlined /></div>
      <Text className="eyebrow">YOUR SAVED ACTIVITY</Text>
      <Title level={2}>Keep your history with you</Title>
      <Button type="primary" icon={<LoginOutlined />} onClick={onSignIn}>Continue with an account</Button>
    </section>
  );
}

function SnapshotCard({ snapshot, onView, onDelete }) {
  return (
    <Card size="small" className="snapshot-card">
      <Space wrap>
        <Tag color="blue">{snapshot.groupName}</Tag>
        <Text type="secondary">{new Date(snapshot.savedAt).toLocaleString()}</Text>
      </Space>
      <div className="history-description">
        <div>
          <Text strong>{snapshot.expenses?.length || 0} expenses · {snapshot.people?.length || 0} people</Text>
          <br />
          <Text type="secondary">{snapshot.settlements?.length || 0} suggested payments</Text>
        </div>
        <Text strong>{formatCurrency(snapshot.total, snapshot.currencyCode)}</Text>
      </div>
      <div className="snapshot-actions">
        <Button type="link" onClick={() => onView(snapshot)}>View snapshot</Button>
        <Popconfirm title="Delete this saved split?" onConfirm={() => onDelete(snapshot)}>
          <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete saved split" />
        </Popconfirm>
      </div>
    </Card>
  );
}

function ActivityTimeline({ activity, formatMoney }) {
  return (
    <Timeline
      className="history-timeline"
      items={activity.map((item) => ({
        color: item.kind === 'payment' ? 'green' : 'blue',
        children: (
          <Card size="small" className="history-item">
            <Space wrap>
              <Tag color={item.kind === 'payment' ? 'green' : 'blue'}>
                {item.kind === 'payment' ? 'Payment' : item.category || 'Expense'}
              </Tag>
              <Tag>{item.groupName}</Tag>
              <Text type="secondary">
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Date not recorded'}
              </Text>
            </Space>
            <div className="history-description">
              <Text strong>{item.kind === 'payment' ? item.payer + ' paid ' + item.payee : item.description}</Text>
              <Text strong>{formatMoney(item.amount)}</Text>
            </div>
          </Card>
        ),
      }))}
    />
  );
}

export default function HistoryPage({
  groups, user, cloudConfigured, cloudReady, syncError, formatMoney,
  onSignIn, onExportBackup, onViewSnapshot, onDeleteSnapshot,
}) {
  if (!user && cloudConfigured) return <AccountGate onSignIn={onSignIn} />;
  if (user && !cloudReady) {
    return (
      <section className="page-panel">
        <Spin tip="Loading your history…"><div style={{ minHeight: 120 }} /></Spin>
      </section>
    );
  }
  const snapshots = collectSnapshots(groups);
  const activity = collectActivity(groups);
  return (
    <section className="page-panel">
      <div className="page-toolbar">
        <Button icon={<DownloadOutlined />} onClick={onExportBackup}>Download backup</Button>
      </div>
      {user && syncError && (
        <Alert
          type="warning"
          showIcon
          message="Cloud history could not be loaded. Showing what is saved on this device."
          style={{ marginBottom: 12 }}
        />
      )}
      {snapshots.length > 0 && (
        <>
          <Title level={4}>Saved splits</Title>
          <Row gutter={[12, 12]} className="snapshot-grid">
            {snapshots.map((snapshot) => (
              <Col xs={24} md={12} key={snapshot.id}>
                <SnapshotCard snapshot={snapshot} onView={onViewSnapshot} onDelete={onDeleteSnapshot} />
              </Col>
            ))}
          </Row>
          <Divider />
        </>
      )}
      {activity.length
        ? <ActivityTimeline activity={activity} formatMoney={formatMoney} />
        : <Empty className="empty-panel" description="No activity yet. Add an expense to see it here." />}
    </section>
  );
}
