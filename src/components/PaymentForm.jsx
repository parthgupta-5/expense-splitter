import React, { useId, useState } from 'react';
import { Sheet } from './group/Sheet';
import Icon from './group/Icons';
import PersonMark from './group/PersonMark';
import { paymentExceedsOwed } from '../lib/splits';
import { makeId } from '../lib/storage';

/** One suggested payment drawn as a stitched line between the two people. */
export function StitchRow({ payer, payee, amount, formatMoney, action, settled = false }) {
  return (
    <div className="gp-stitch-row">
      <div className="gp-stitch" aria-hidden="true">
        <PersonMark name={payer} size={32} />
        <span className={'gp-stitch-line' + (settled ? ' is-settled' : '')} />
        <PersonMark name={payee} size={32} />
      </div>
      <p className="gp-stitch-text">
        <strong>{payer}</strong> pays <strong>{payee}</strong>
        <span className="gp-stitch-amount">{formatMoney(amount)}</span>
      </p>
      {action}
    </div>
  );
}

export function SettlePlan({ settlements, formatMoney, onMarkPaid }) {
  if (!settlements.length) {
    return <p className="gp-square" role="status">Everyone is square. Nothing left to pay.</p>;
  }
  return (
    <ul className="gp-plain-list">
      {settlements.map((item) => (
        <li key={item.payer + '>' + item.payee}>
          <StitchRow
            {...item}
            formatMoney={formatMoney}
            action={(
              <button
                type="button"
                className="gp-button is-small"
                onClick={() => onMarkPaid(item)}
                aria-label={'Mark paid: ' + item.payer + ' pays ' + item.payee + ' ' + formatMoney(item.amount)}
              >
                Mark paid
              </button>
            )}
          />
        </li>
      ))}
    </ul>
  );
}

function PaymentFields({
  draft, people, balances, currencySymbol, onAddPayment, notify, confirm, onDone, onCancel,
}) {
  const uid = useId();
  const [payer, setPayer] = useState(draft.payer || '');
  const [payee, setPayee] = useState(draft.payee || '');
  const [amount, setAmount] = useState(draft.amount || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const kept = await onAddPayment({
      payer, payee, id: makeId(), amount: Number(amount), createdAt: new Date().toISOString(),
    });
    setSaving(false);
    if (!kept) return;
    notify.success('Payment recorded');
    onDone();
  };

  const record = (event) => {
    event.preventDefault();
    const found = {};
    if (!payer) found.payer = 'Choose who paid';
    if (!payee) found.payee = 'Choose who received it';
    if (!amount || !(Number(amount) >= 0.01)) found.amount = 'Enter an amount';
    if (!found.payer && !found.payee && payer === payee) found.payee = 'Choose two different people';
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!paymentExceedsOwed(balances, payer, payee, Number(amount))) { save(); return; }
    confirm({
      title: 'This is more than the current balance',
      content: payer + ' does not currently owe ' + payee + ' this much. Recording it will flip the balance. Record anyway?',
      okText: 'Record anyway',
      onOk: save,
    });
  };

  const people$ = (id, value, setValue, label, error) => (
    <div className="gp-field">
      <label className="gp-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="gp-input gp-select"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? id + '-error' : undefined}
        onChange={(event) => { setValue(event.target.value); setErrors((c) => ({ ...c, [label === 'From' ? 'payer' : 'payee']: undefined })); }}
      >
        <option value="">Select a person</option>
        {people.map((person) => <option key={person} value={person}>{person}</option>)}
      </select>
      {error && <p className="gp-error" id={id + '-error'}>{error}</p>}
    </div>
  );

  return (
    <form className="gp-form" onSubmit={record} noValidate aria-label="Record a payment">
      {people$(uid + 'from', payer, setPayer, 'From', errors.payer)}
      {people$(uid + 'to', payee, setPayee, 'To', errors.payee)}
      <div className="gp-field">
        <label className="gp-label" htmlFor={uid + 'amount'}>Payment amount</label>
        <span className="gp-input-wrap is-amount">
          <span className="gp-affix" aria-hidden="true">{currencySymbol}</span>
          <input
            id={uid + 'amount'}
            className="gp-input is-number is-big"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? uid + 'amount-error' : undefined}
            value={amount}
            onChange={(event) => {
              const text = event.target.value.replace(/,/g, '');
              if (/^\d*\.?\d{0,2}$/.test(text)) { setAmount(text); setErrors((c) => ({ ...c, amount: undefined })); }
            }}
          />
        </span>
        {errors.amount && <p className="gp-error" id={uid + 'amount-error'}>{errors.amount}</p>}
      </div>
      <div className="gp-sheet-actions is-inline">
        <button type="button" className="gp-button" onClick={onCancel}>Back</button>
        <button type="submit" className="gp-button is-primary is-wide" disabled={saving}>
          {saving ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
}

/**
 * The settle-up sheet: the stitched plan, plus the payment form. "Mark paid" only prefills the form, so the
 * existing validation and the "more than owed" confirmation always apply.
 */
export default function SettleSheet({
  open, onClose, draft, setDraft, people, balances, settlements, currencySymbol, formatMoney,
  onAddPayment, notify, confirm,
}) {
  return (
    <Sheet open={open} onClose={onClose} title={draft ? 'Record a payment' : 'Settle up'}>
      {draft ? (
        <PaymentFields
          key={draft.key}
          draft={draft}
          people={people}
          balances={balances}
          currencySymbol={currencySymbol}
          onAddPayment={onAddPayment}
          notify={notify}
          confirm={confirm}
          onDone={() => setDraft(null)}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <div className="gp-settle">
          <p className="gp-lede">
            {settlements.length
              ? 'The fewest payments that clear every balance.'
              : 'All balances are cleared.'}
          </p>
          <SettlePlan
            settlements={settlements}
            formatMoney={formatMoney}
            onMarkPaid={(item) => setDraft({
              key: makeId(), payer: item.payer, payee: item.payee, amount: Number(item.amount).toFixed(2),
            })}
          />
          <button type="button" className="gp-button is-quiet" onClick={() => setDraft({ key: makeId() })}>
            <Icon name="plus" size={16} /> Record a different payment
          </button>
        </div>
      )}
    </Sheet>
  );
}
