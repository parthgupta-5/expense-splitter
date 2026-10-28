import { useState } from 'react';
import { Form } from 'antd';
import { centsToDecimal, parseMoneyInput } from '../lib/money';
import { listNames, removedPeopleIn } from '../lib/people';
import { computeSplit, validateSplit } from '../lib/splits';
import { makeId } from '../lib/storage';

const SPLIT_TYPES = ['equal', 'unequal', 'shares', 'percentages'];
const mapValues = (object, fn) => Object.fromEntries(Object.entries(object).map(([k, v]) => [k, fn(v)]));

/** Custom amounts are typed text; an empty field means nothing for that person. Returns { cents } or { error }. */
function parseCustomAmounts(participants, texts) {
  const cents = {};
  for (const person of participants) {
    const text = String(texts[person] ?? '').trim();
    const parsed = text ? parseMoneyInput(text, { allowZero: true }) : { cents: 0 };
    if (parsed.error) return { error: person + ': ' + parsed.error };
    cents[person] = parsed.cents;
  }
  return { cents };
}

/**
 * State and handlers for adding/editing an expense (split type, participants, per-person values).
 * Amounts are integer cents; custom amounts stay as the typed text until they are saved.
 * `onSave(expense)` persists it and resolves to true when it was kept.
 */
export function useExpenseForm({ people, expenses, onSave, notify }) {
  const [form] = Form.useForm();
  const [splitType, setSplitType] = useState('equal');
  const [splitValues, setSplitValues] = useState({});
  const [participantSel, setParticipantSel] = useState(null); // null means "everyone"
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const participants = (participantSel ?? people).filter((name) => people.includes(name));

  const reset = () => {
    form.resetFields();
    setSplitType('equal');
    setSplitValues({});
    setParticipantSel(null);
    setEditingId(null);
  };

  // Never re-split a historical expense around someone who was removed: their share would silently move to others.
  // Checked when editing starts and again on save (another member may remove someone while the form is open).
  const refuseRemoved = (expense) => {
    const removed = removedPeopleIn(expense, people);
    if (!removed.length) return false;
    notify.error(`This expense involves ${listNames(removed)}, who ${removed.length === 1 ? 'was' : 'were'} removed. `
      + 'Add them back before editing this expense.');
    return true;
  };

  const changeSplitType = (value) => { setSplitType(value); setSplitValues({}); };
  const setSplitValue = (person, value) => setSplitValues((current) => ({ ...current, [person]: value }));
  const changeParticipants = (value) => setParticipantSel(value.length === people.length ? null : value);

  const submit = async (values) => {
    const total = parseMoneyInput(values.amount);
    if (total.error) { notify.error(total.error); return; }
    if (!SPLIT_TYPES.includes(splitType)) { notify.error('Choose a split method'); return; }
    let inputs = splitValues;
    if (splitType === 'unequal' && participants.length) {
      const custom = parseCustomAmounts(participants, splitValues);
      if (custom.error) { notify.error(custom.error); return; }
      inputs = custom.cents;
    }
    const problem = validateSplit(splitType, total.cents, participants, inputs);
    if (problem) { notify.error(problem); return; }
    const previous = editingId === null ? null : expenses.find((item) => item.id === editingId);
    if (previous && refuseRemoved(previous)) return;
    const now = new Date().toISOString();
    const expense = {
      id: previous?.id || makeId(),
      description: values.description.trim(),
      payer: values.payer,
      amountCents: total.cents,
      splitType,
      splitCents: computeSplit(splitType, total.cents, participants, inputs),
      participants: [...participants],
      // Shares and percentages are weights, kept so the form can show them again; custom amounts equal splitCents.
      splitValues: splitType === 'shares' || splitType === 'percentages' ? { ...splitValues } : undefined,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      category: values.category || 'Other',
      note: values.note || '',
    };
    setSaving(true);
    const kept = await onSave(expense);
    setSaving(false);
    if (!kept) return;
    notify.success(previous ? 'Expense updated' : 'Expense added');
    reset();
  };

  /** Loads an expense into the form. Returns false (and says why) when it cannot be edited. */
  const edit = (id) => {
    const expense = expenses.find((item) => item.id === id);
    if (!expense || refuseRemoved(expense)) return false;
    const split = expense.splitCents || {};
    const shares = Object.values(split);
    // Expenses saved before split types existed: equal when every share is within a cent of total / n.
    const wasEqual = shares.length > 0
      && shares.every((share) => Math.abs(share * shares.length - expense.amountCents) < shares.length);
    const type = expense.splitType || (wasEqual ? 'equal' : 'unequal');
    // Older expenses have no stored participants: fall back to everyone who has a share.
    const stored = Array.isArray(expense.participants) && expense.participants.length
      ? expense.participants
      : Object.keys(split).filter((name) => split[name] > 0 || type !== 'equal');
    const restored = stored.filter((name) => people.includes(name));
    setEditingId(id);
    setSplitType(type);
    setParticipantSel(restored.length === people.length ? null : restored);
    if (type === 'unequal') setSplitValues(mapValues(split, centsToDecimal));
    else if (expense.splitValues && type !== 'equal') setSplitValues({ ...expense.splitValues });
    else if (type === 'percentages') {
      setSplitValues(Object.fromEntries(people.map((person) => [
        person, expense.amountCents ? Math.round(((split[person] || 0) * 10000) / expense.amountCents) / 100 : 0,
      ])));
    } else if (type === 'shares') {
      // No stored weights: the cents themselves are proportional weights.
      setSplitValues(Object.fromEntries(people.map((person) => [person, split[person] || 0])));
    } else setSplitValues({});
    form.setFieldsValue({
      description: expense.description,
      payer: people.includes(expense.payer) ? expense.payer : undefined,
      amount: centsToDecimal(expense.amountCents),
      category: expense.category || 'Other',
      note: expense.note || '',
    });
    return true;
  };

  return {
    form, splitType, splitValues, participants, editingId, saving,
    reset, submit, edit, changeSplitType, setSplitValue, changeParticipants,
  };
}
