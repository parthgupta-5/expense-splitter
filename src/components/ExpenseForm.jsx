import React, { useEffect, useId, useRef, useState } from 'react';
import { Sheet } from './group/Sheet';
import PersonMark from './group/PersonMark';
import Icon from './group/Icons';
import { DESCRIPTION_MAX, NOTE_MAX } from '../lib/limits';
import { computeSplit, sumAmounts } from '../lib/splits';

export const CATEGORIES = ['Food & drink', 'Travel', 'Stay', 'Groceries', 'Transport', 'Entertainment', 'Other'];
const SPLIT_TYPES = [
  { label: 'Equal', value: 'equal' },
  { label: 'Custom amounts', value: 'unequal' },
  { label: 'By shares', value: 'shares' },
  { label: 'Percentages', value: 'percentages' },
];
const EDITOR_TITLES = {
  unequal: 'Enter each person’s amount',
  shares: 'Set shares for each person',
  percentages: 'Set each person’s percentage',
};
const PLACES = { unequal: 2, percentages: 2, shares: 3 };

/** Keeps only well-formed decimal text, so the field can never hold something the maths would misread. */
const decimal = (raw, places) => {
  const text = raw.replace(/,/g, '');
  const pattern = new RegExp('^\\d*\\.?\\d{0,' + places + '}$');
  return pattern.test(text) ? text : null;
};

function Field({ id, label, error, hint, children }) {
  return (
    <div className="gp-field">
      <label className="gp-label" htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="gp-hint" id={id + '-hint'}>{hint}</p>}
      {error && <p className="gp-error" id={id + '-error'}>{error}</p>}
    </div>
  );
}

function SplitEditor({
  splitType, participants, values, currencySymbol, formatMoney, total, onChange,
}) {
  const unit = { percentages: '%', shares: 'shares', unequal: currencySymbol }[splitType];
  let summary;
  let balanced = false;
  if (splitType === 'unequal') {
    const assigned = sumAmounts(participants.map((person) => values[person]));
    balanced = total > 0 && Math.round(assigned * 100) === Math.round(total * 100);
    summary = formatMoney(assigned) + ' of ' + formatMoney(total) + ' assigned';
  } else if (splitType === 'percentages') {
    const assigned = participants.reduce((sum, person) => sum + Math.round((Number(values[person]) || 0) * 100), 0);
    balanced = assigned === 10000;
    summary = assigned / 100 + '% of 100% assigned';
  } else {
    const assigned = participants.reduce((sum, person) => sum + (Number(values[person]) || 0), 0);
    balanced = assigned > 0;
    summary = assigned + (assigned === 1 ? ' share' : ' shares') + ' in total';
  }
  return (
    <fieldset className="gp-split-editor">
      <legend className="gp-label">{EDITOR_TITLES[splitType]}</legend>
      {participants.map((person) => (
        <label className="gp-split-row" key={person}>
          <PersonMark name={person} size={28} />
          <span className="gp-split-name">{person}</span>
          <span className="gp-input-wrap is-small">
            {splitType === 'unequal' && <span className="gp-affix" aria-hidden="true">{unit}</span>}
            <input
              className="gp-input is-number"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              aria-label={person + ' ' + { unequal: 'amount', shares: 'shares', percentages: 'percentage' }[splitType]}
              value={values[person] ?? ''}
              onChange={(event) => {
                const next = decimal(event.target.value, PLACES[splitType]);
                if (next !== null) onChange(person, next);
              }}
            />
            {splitType !== 'unequal' && <span className="gp-affix is-after" aria-hidden="true">{unit}</span>}
          </span>
        </label>
      ))}
      <p className={'gp-meter' + (balanced ? ' is-balanced' : '')} role="status">
        {balanced && <Icon name="check" size={16} />}{summary}
      </p>
    </fieldset>
  );
}

function EqualPreview({ amount, participants, formatMoney }) {
  const total = Number(amount);
  if (!participants.length || !Number.isFinite(total) || total < 0.01) return null;
  const parts = Object.values(computeSplit('equal', total, participants));
  const low = Math.min(...parts);
  const high = Math.max(...parts);
  return (
    <p className="gp-meter is-balanced" role="status">
      <Icon name="check" size={16} />
      {low === high ? formatMoney(low) + ' each' : 'About ' + formatMoney(low) + ' each, to the cent'}
    </p>
  );
}

/** Category and note. Starts open when editing an expense that already has either (the sheet remounts per opening). */
function MoreDetails({ uid, values, setField }) {
  const [open, setOpen] = useState(() => Boolean(values.note) || values.category !== 'Other');
  return (
    <details className="gp-more" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>More details</summary>
      <Field id={uid + 'category'} label="Category">
        <select
          id={uid + 'category'}
          className="gp-input gp-select"
          value={values.category}
          onChange={(event) => setField('category', event.target.value)}
        >
          {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </Field>
      <Field id={uid + 'note'} label="Note (optional)">
        <input
          id={uid + 'note'}
          className="gp-input"
          placeholder="Add context for the group"
          maxLength={NOTE_MAX}
          value={values.note}
          onChange={(event) => setField('note', event.target.value)}
        />
      </Field>
    </details>
  );
}

/** The add / edit expense sheet. Fields are plain controls; the sheet supplies the dialog behaviour. */
export default function ExpenseSheet({
  open, onClose, expenseForm, people, currencySymbol, formatMoney,
}) {
  const {
    values, errors, splitType, splitValues, participants, editingId, saving,
    reset, submit, setField, changeSplitType, setSplitValue, changeParticipants,
  } = expenseForm;
  const editing = editingId !== null;
  const uid = useId();
  const amountRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Start on the amount, unless the person has already moved into the form themselves.
    const timer = setTimeout(() => {
      const form = document.getElementById(uid + 'form');
      if (!form?.contains(document.activeElement)) amountRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
    // Only when the sheet opens: later typing must not reopen or refocus anything.
  }, [open, editingId, uid]);

  const total = Number(values.amount) || 0;
  const toggleParticipant = (person) => changeParticipants(
    participants.includes(person) ? participants.filter((name) => name !== person) : people.filter((name) => name === person || participants.includes(name)),
  );

  const onSubmit = async (event) => {
    event.preventDefault();
    const saved = await submit();
    if (saved) onClose(saved);
  };

  const footer = (
    <div className="gp-sheet-actions">
      <button type="button" className="gp-button" onClick={editing ? () => onClose() : reset}>
        {editing ? 'Cancel editing' : 'Clear'}
      </button>
      <button type="submit" form={uid + 'form'} className="gp-button is-primary is-wide" disabled={saving}>
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
        {total > 0 && !saving && <span className="gp-button-amount"> · {formatMoney(total)}</span>}
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={() => onClose()} title={editing ? 'Edit expense' : 'Add an expense'} footer={footer}>
      <form id={uid + 'form'} className="gp-form" onSubmit={onSubmit} noValidate>
        <Field id={uid + 'amount'} label="Total amount" error={errors.amount}>
          <span className="gp-input-wrap is-amount">
            <span className="gp-affix" aria-hidden="true">{currencySymbol}</span>
            <input
              id={uid + 'amount'}
              ref={amountRef}
              className="gp-input is-number is-big"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? uid + 'amount-error' : undefined}
              value={values.amount}
              onChange={(event) => {
                const next = decimal(event.target.value, 2);
                if (next !== null) setField('amount', next);
              }}
            />
          </span>
        </Field>
        <Field id={uid + 'description'} label="What was it for?" error={errors.description}>
          <input
            id={uid + 'description'}
            className="gp-input"
            placeholder="Dinner, groceries, taxi…"
            maxLength={DESCRIPTION_MAX}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? uid + 'description-error' : undefined}
            value={values.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </Field>

        <fieldset className="gp-fieldset" aria-describedby={errors.payer ? uid + 'payer-error' : undefined}>
          <legend className="gp-label">Who paid?</legend>
          <div className="gp-chips" role="radiogroup" aria-label="Who paid?">
            {people.map((person) => (
              <label className="gp-chip" key={person}>
                <input
                  type="radio"
                  name={uid + 'payer'}
                  checked={values.payer === person}
                  onChange={() => setField('payer', person)}
                />
                <span><PersonMark name={person} size={22} />{person}</span>
              </label>
            ))}
          </div>
          {errors.payer && <p className="gp-error" id={uid + 'payer-error'}>{errors.payer}</p>}
        </fieldset>

        <fieldset className="gp-fieldset">
          <legend className="gp-label">Split between</legend>
          <div className="gp-chips">
            {people.map((person) => (
              <label className="gp-chip" key={person}>
                <input type="checkbox" checked={participants.includes(person)} onChange={() => toggleParticipant(person)} />
                <span><PersonMark name={person} size={22} />{person}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="gp-fieldset">
          <legend className="gp-label">Split method</legend>
          <div className="gp-segmented" role="radiogroup" aria-label="Split method">
            {SPLIT_TYPES.map((item) => (
              <label className="gp-segment" key={item.value}>
                <input
                  type="radio"
                  name={uid + 'split'}
                  checked={splitType === item.value}
                  onChange={() => changeSplitType(item.value)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {splitType === 'equal'
          ? <EqualPreview amount={values.amount} participants={participants} formatMoney={formatMoney} />
          : (
            <SplitEditor
              splitType={splitType}
              participants={participants}
              values={splitValues}
              currencySymbol={currencySymbol}
              formatMoney={formatMoney}
              total={total}
              onChange={setSplitValue}
            />
          )}
        {errors.split && <p className="gp-error" role="alert">{errors.split}</p>}

        <MoreDetails uid={uid} values={values} setField={setField} />
      </form>
    </Sheet>
  );
}
