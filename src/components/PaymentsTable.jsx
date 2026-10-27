import React, { useState } from 'react';
import Icon from './group/Icons';
import { StitchRow } from './PaymentForm';

const PAGE = 8;

export default function PaymentsTable({
  payments, formatMoney, freshId, onDelete,
}) {
  const [shown, setShown] = useState(PAGE);
  if (!payments.length) {
    return (
      <div className="gp-empty">
        <p className="gp-empty-title">No payments recorded yet</p>
        <p className="gp-empty-text">When someone pays someone back, record it and the balances update.</p>
      </div>
    );
  }
  return (
    <>
      <ul className="gp-plain-list gp-ledger" aria-label="Payments">
        {payments.slice(0, shown).map((payment) => (
          <li key={payment.id} className={'gp-entry is-payment' + (payment.id === freshId ? ' is-fresh' : '')}>
            <StitchRow
              payer={payment.payer}
              payee={payment.payee}
              amount={payment.amount}
              formatMoney={formatMoney}
              settled
              action={(
                <button
                  type="button"
                  className="gp-icon-button is-danger-outline"
                  onClick={() => onDelete(payment)}
                  aria-label={'Remove payment: ' + payment.payer + ' to ' + payment.payee}
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            />
          </li>
        ))}
      </ul>
      {payments.length > shown && (
        <button type="button" className="gp-button is-quiet" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, payments.length - shown)} more
        </button>
      )}
    </>
  );
}
