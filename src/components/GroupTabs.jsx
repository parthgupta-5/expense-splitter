import React from 'react';
import { Tabs, Tag } from 'antd';
import BalancesPanel from './BalancesPanel';
import ExpenseList from './ExpenseList';
import PaymentList from './PaymentList';

const countLabel = (label, count) => <span>{label} <Tag bordered={false}>{count}</Tag></span>;

/**
 * Expenses, Balances (who owes whom, the settle-up plan, Copy settlement and Record a payment) and Payments. The open
 * tab is controlled by the page, so the summary's "View balances" can switch to it.
 */
export default function GroupTabs({
  activeTab, onTabChange, expenses, payments, balances, settlements, formatMoney,
  onEditExpense, onDeleteExpense, onDeletePayment, onAddExpense, onCopySummary, paymentForm,
}) {
  return (
    <section className="section-card group-tabs" id="group-tabs" tabIndex={-1} aria-labelledby="group-tabs-heading">
      <h2 id="group-tabs-heading" className="visually-hidden">Expenses, balances and payments</h2>
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          {
            key: 'expenses',
            label: countLabel('Expenses', expenses.length),
            children: (
              <ExpenseList
                expenses={expenses}
                formatMoney={formatMoney}
                onEdit={onEditExpense}
                onDelete={onDeleteExpense}
                onAdd={onAddExpense}
              />
            ),
          },
          {
            key: 'balances',
            label: 'Balances',
            children: (
              <BalancesPanel
                balances={balances}
                settlements={settlements}
                formatMoney={formatMoney}
                onCopy={onCopySummary}
                paymentForm={paymentForm}
              />
            ),
          },
          {
            key: 'payments',
            label: countLabel('Payments', payments.length),
            children: <PaymentList payments={payments} formatMoney={formatMoney} onDelete={onDeletePayment} />,
          },
        ]}
      />
    </section>
  );
}
