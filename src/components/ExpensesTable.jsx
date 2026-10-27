import React, { useState } from 'react';
import Icon from './group/Icons';

const SPLIT_LABELS = { unequal: 'Custom amounts', percentages: 'Percentages', shares: 'Shares', equal: 'Equal split' };
const PAGE = 8;

export const shortDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function ExpenseEntry({
  expense, formatMoney, fresh, onEdit, onDelete,
}) {
  const [open, setOpen] = useState(false);
  const date = shortDate(expense.createdAt);
  const split = Object.entries(expense.splitDetails || {});
  return (
    <li className={'gp-entry' + (fresh ? ' is-fresh' : '')}>
      <button type="button" className="gp-entry-main" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="gp-entry-text">
          <span className="gp-entry-title">{expense.description}</span>
          <span className="gp-entry-meta">
            {expense.category || 'Other'} · Paid by {expense.payer}{date ? ' · ' + date : ''}
          </span>
        </span>
        <span className="gp-amount">{formatMoney(expense.amount)}</span>
      </button>
      {open && (
        <div className="gp-entry-detail">
          <p className="gp-detail-kind">{SPLIT_LABELS[expense.splitType] || 'Equal split'}</p>
          <ul className="gp-plain-list gp-split-list">
            {split.map(([name, value]) => (
              <li key={name}><span>{name}</span><span className="gp-amount">{formatMoney(value)}</span></li>
            ))}
          </ul>
          {expense.note && <p className="gp-note">{expense.note}</p>}
          <div className="gp-entry-actions">
            <button type="button" className="gp-button is-small" onClick={() => onEdit(expense.id)}>
              <Icon name="edit" size={16} /> Edit<span className="gp-sr"> {expense.description}</span>
            </button>
            <button
              type="button"
              className="gp-button is-small is-danger-outline"
              onClick={() => onDelete(expense)}
            >
              <Icon name="trash" size={16} /> Delete<span className="gp-sr"> {expense.description}</span>
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function ExpensesTable({
  expenses, formatMoney, freshId, onEdit, onDelete, onAdd,
}) {
  const [shown, setShown] = useState(PAGE);
  if (!expenses.length) {
    return (
      <div className="gp-empty">
        <p className="gp-empty-title">Nothing logged yet</p>
        <p className="gp-empty-text">Add the first expense and the balances start working themselves out.</p>
        <button type="button" className="gp-button is-primary" onClick={onAdd}>Add the first expense</button>
      </div>
    );
  }
  return (
    <>
      <ul className="gp-plain-list gp-ledger" aria-label="Expenses">
        {expenses.slice(0, shown).map((expense) => (
          <ExpenseEntry
            key={expense.id}
            expense={expense}
            formatMoney={formatMoney}
            fresh={expense.id === freshId}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
      {expenses.length > shown && (
        <button type="button" className="gp-button is-quiet" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, expenses.length - shown)} more
        </button>
      )}
    </>
  );
}
