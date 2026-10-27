import React, { useId, useRef, useState } from 'react';
import ExpensesTable from './ExpensesTable';
import PaymentsTable from './PaymentsTable';

const TABS = ['expenses', 'payments'];

/** The ledger: expenses and payments behind a two-way switch (a real tablist with arrow-key support). */
export default function ActivityPanel({
  expenses, payments, formatMoney, freshId, onAdd, onEditExpense, onDeleteExpense, onDeletePayment,
}) {
  const uid = useId();
  const [tab, setTab] = useState('expenses');
  const refs = useRef({});
  const counts = { expenses: expenses.length, payments: payments.length };

  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <section className="gp-ledger-section" aria-label="Group activity">
      <div className="gp-tabs" role="tablist" aria-label="Group activity" onKeyDown={onKeyDown}>
        {TABS.map((key) => (
          <button
            key={key}
            ref={(node) => { refs.current[key] = node; }}
            type="button"
            role="tab"
            id={uid + key}
            aria-selected={tab === key}
            aria-controls={uid + key + '-panel'}
            tabIndex={tab === key ? 0 : -1}
            className="gp-tab"
            onClick={() => setTab(key)}
          >
            {key === 'expenses' ? 'Expenses' : 'Payments'} <span className="gp-count">{counts[key]}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={uid + tab + '-panel'} aria-labelledby={uid + tab}>
        {tab === 'expenses' ? (
          <ExpensesTable
            expenses={expenses}
            formatMoney={formatMoney}
            freshId={freshId}
            onAdd={onAdd}
            onEdit={onEditExpense}
            onDelete={onDeleteExpense}
          />
        ) : (
          <PaymentsTable payments={payments} formatMoney={formatMoney} freshId={freshId} onDelete={onDeletePayment} />
        )}
      </div>
    </section>
  );
}
