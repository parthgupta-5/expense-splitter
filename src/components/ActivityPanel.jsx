import React from 'react';
import { Button, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined, SaveOutlined } from '@ant-design/icons';
import BalancesPanel from './BalancesPanel';
import ExpensesTable from './ExpensesTable';
import PaymentsTable from './PaymentsTable';

const { Text, Title } = Typography;

const countLabel = (label, count) => <span>{label} <Tag bordered={false}>{count}</Tag></span>;

export default function ActivityPanel({
  expenses, payments, balances, settlements, formatMoney,
  onEditExpense, onDeleteExpense, onDeletePayment, onSaveSplit, onExportCsv, onCopySummary,
}) {
  const empty = !expenses.length && !payments.length;
  return (
    <section className="section-card activity-card">
      <div className="section-heading">
        <div>
          <Text className="eyebrow">THE FULL PICTURE</Text>
          <Title level={3}>Group activity</Title>
        </div>
        <Space wrap>
          <Tooltip title={empty ? 'Add an expense or payment first' : 'Save a snapshot of this split'}>
            <Button icon={<SaveOutlined />} disabled={empty} onClick={onSaveSplit}>Save split</Button>
          </Tooltip>
          <Button icon={<DownloadOutlined />} onClick={onExportCsv}>Export CSV</Button>
          <Button icon={<CopyOutlined />} onClick={onCopySummary}>Copy settlement</Button>
        </Space>
      </div>
      <Tabs
        items={[
          {
            key: 'expenses',
            label: countLabel('Expenses', expenses.length),
            children: (
              <ExpensesTable
                expenses={expenses}
                formatMoney={formatMoney}
                onEdit={onEditExpense}
                onDelete={onDeleteExpense}
              />
            ),
          },
          {
            key: 'balances',
            label: countLabel('Balances', Object.keys(balances).length),
            children: <BalancesPanel balances={balances} settlements={settlements} formatMoney={formatMoney} />,
          },
          {
            key: 'payments',
            label: countLabel('Payments', payments.length),
            children: <PaymentsTable payments={payments} formatMoney={formatMoney} onDelete={onDeletePayment} />,
          },
        ]}
      />
    </section>
  );
}
