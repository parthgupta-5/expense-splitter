import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Alert, Button, Card, Col, Divider, Empty, Popconfirm, Row, Space, Spin, Tag, Timeline, Typography,
} from 'antd';
import { DeleteOutlined, LoginOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import PageIntro from '../components/PageIntro';
import SnapshotModal from '../components/SnapshotModal';
import { describeActivity } from '../lib/activity';
import { formatCents } from '../lib/currency';
import { friendlyError } from '../lib/errors';
import { collectActivity, collectSnapshots } from '../lib/history';
import { supabaseConfigured } from '../supabase';

const { Text, Title } = Typography;
const TAG_COLORS = { expense: 'blue', payment: 'green', people: 'purple', group: 'default' };

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
        <Text strong>{formatCents(snapshot.totalCents, snapshot.currencyCode)}</Text>
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

/** Guest activity is rebuilt from the groups on this device. */
function localActivity(groups) {
  const currencies = Object.fromEntries(groups.map((group) => [group.id, group.currencyCode]));
  return collectActivity(groups).map((item) => {
    const money = formatCents(item.amountCents, currencies[item.groupId]);
    return {
      key: item.kind + item.id,
      kind: item.kind,
      groupName: item.groupName,
      createdAt: item.createdAt,
      label: item.kind === 'payment' ? 'Payment' : item.category || 'Expense',
      text: item.kind === 'payment' ? `${item.payer} paid ${item.payee} ${money}` : `${item.description} · ${money}, paid by ${item.payer}`,
    };
  });
}

/** Signed-in activity comes from the server-side log, so it includes what other members did. */
function useCloudActivity(enabled, groups) {
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  // Re-read the log whenever group data changes (including live updates from other members).
  const version = useMemo(() => groups.map((group) => group.updatedAt + group.expenses.length + group.payments.length).join('|'), [groups]);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      repo.fetchActivity()
        .then((rows) => { if (!cancelled) setState({ rows, loading: false, error: null }); })
        .catch((error) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: friendlyError(error) })); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, version]);
  return state;
}

export default function HistoryPage() {
  const { workspace, openAuth, notify } = useApp();
  const { groups, actions } = workspace;
  const cloud = workspace.mode === 'cloud';
  const [selected, setSelected] = useState(null);
  const cloudActivity = useCloudActivity(cloud, groups);

  const snapshots = collectSnapshots(groups);
  const byId = Object.fromEntries(groups.map((group) => [group.id, group]));
  const activity = cloud
    ? cloudActivity.rows.map((row) => {
      const group = byId[row.group_id];
      const { text, kind } = describeActivity(row, (cents) => formatCents(cents, group?.currencyCode));
      return {
        key: 'log' + row.id, kind, groupName: group?.name || 'Deleted group', createdAt: row.created_at, label: kind, text,
      };
    })
    : localActivity(groups);

  const deleteSnapshot = async (snapshot) => {
    if (await actions.deleteSnapshot(snapshot.groupId, snapshot.id)) notify.success('Saved split deleted');
  };

  return (
    <>
      <PageIntro title="Recent activities" />
      <section className="page-panel">
        {!cloud && supabaseConfigured && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="This history is saved on this device only."
            description="Sign in to keep it on every device and to see what friends add to shared groups."
            action={<Button size="small" icon={<LoginOutlined />} onClick={() => openAuth('signup')}>Sign in</Button>}
          />
        )}
        {cloud && cloudActivity.error && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={'Could not load activity: ' + cloudActivity.error} />
        )}
        {snapshots.length > 0 && (
          <>
            <Title level={4}>Saved splits</Title>
            <Row gutter={[12, 12]} className="snapshot-grid">
              {snapshots.map((snapshot) => (
                <Col xs={24} md={12} key={snapshot.id}>
                  <SnapshotCard snapshot={snapshot} onView={setSelected} onDelete={deleteSnapshot} />
                </Col>
              ))}
            </Row>
            <Divider />
          </>
        )}
        {cloud && cloudActivity.loading && <Spin description="Loading activity…"><div style={{ minHeight: 120 }} /></Spin>}
        {!(cloud && cloudActivity.loading) && (activity.length ? (
          <Timeline
            className="history-timeline"
            items={activity.map((item) => ({
              key: item.key,
              color: item.kind === 'payment' ? 'green' : 'blue',
              content: (
                <Card size="small" className="history-item">
                  <Space wrap>
                    <Tag color={TAG_COLORS[item.kind]}>{item.label}</Tag>
                    <Tag>{item.groupName}</Tag>
                    <Text type="secondary">{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Date not recorded'}</Text>
                  </Space>
                  <div className="history-description"><Text strong>{item.text}</Text></div>
                </Card>
              ),
            }))}
          />
        ) : (
          <Empty
            className="empty-panel"
            description="No history yet. Expenses, payments, new people and saved splits from your groups will appear here."
          >
            <Link to="/groups"><Button type="primary">Go to your groups</Button></Link>
          </Empty>
        ))}
      </section>
      <SnapshotModal snapshot={selected} onClose={() => setSelected(null)} />
    </>
  );
}
