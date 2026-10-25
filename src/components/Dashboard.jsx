import React from 'react';
import { Card, Col, Row, Statistic, Tag } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, CloudOutlined } from '@ant-design/icons';
import ActivityPanel from './ActivityPanel';
import ExpenseForm from './ExpenseForm';
import PaymentForm from './PaymentForm';
import PeoplePanel from './PeoplePanel';

function SyncStatus({ user, cloudReady, syncError }) {
  let label = 'Saved locally';
  let color = 'success';
  let icon = <CheckCircleFilled />;
  if (user) {
    color = 'blue';
    icon = <CloudOutlined />;
    label = cloudReady ? 'Cloud synced' : 'Syncing…';
    if (syncError) {
      label = 'Sync problem: changes are kept on this device';
      color = 'error';
      icon = <CloseCircleFilled />;
    }
  }
  return <Tag bordered={false} icon={icon} color={color}>{label}</Tag>;
}

export default function Dashboard({
  group, people, expenses, payments, balances, settlements, total, currencySymbol, formatMoney, isScrolled,
  peopleInput, expenseForm, user, cloudReady, syncError, handlers,
}) {
  return (
    <>
      {people.length > 0 && (
        <Row gutter={[13, 13]} className={'stats-row ' + (isScrolled ? 'is-compact' : '')}>
          <Col xs={8}>
            <Card className="stat-card">
              <Statistic title="Group spend" value={total} precision={2} prefix={currencySymbol} />
            </Card>
          </Col>
          <Col xs={8}><Card className="stat-card"><Statistic title="People" value={people.length} /></Card></Col>
          <Col xs={8}><Card className="stat-card"><Statistic title="To settle" value={settlements.length} /></Card></Col>
        </Row>
      )}
      <PeoplePanel
        groupName={group?.name}
        people={people}
        value={peopleInput.value}
        onChange={peopleInput.setValue}
        onAdd={handlers.addPeople}
        onRemove={handlers.removePerson}
      />
      {people.length > 0 && (
        <div className="feature-content">
          <section className="section-card" id="add-expense">
            <ExpenseForm expenseForm={expenseForm} people={people} currencySymbol={currencySymbol} />
            <PaymentForm
              people={people}
              balances={balances}
              currencySymbol={currencySymbol}
              onAddPayment={handlers.addPayment}
              messageApi={handlers.messageApi}
            />
          </section>
          <ActivityPanel
            expenses={expenses}
            payments={payments}
            balances={balances}
            settlements={settlements}
            formatMoney={formatMoney}
            onEditExpense={expenseForm.edit}
            onDeleteExpense={handlers.deleteExpense}
            onDeletePayment={handlers.deletePayment}
            onSaveSplit={handlers.saveSplit}
            onExportCsv={handlers.exportCsv}
            onCopySummary={handlers.copySummary}
          />
        </div>
      )}
      <footer className="page-footer">
        <SyncStatus user={user} cloudReady={cloudReady} syncError={syncError} />
      </footer>
    </>
  );
}
