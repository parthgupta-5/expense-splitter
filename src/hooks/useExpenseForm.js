import { useState } from 'react';
import { Form } from 'antd';
import { computeSplit, validateSplit } from '../lib/splits';
import { makeId } from '../lib/storage';

/**
 * State and handlers for adding/editing an expense (split type, participants, per-person values).
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

  const changeSplitType = (value) => { setSplitType(value); setSplitValues({}); };
  const setSplitValue = (person, value) => setSplitValues((current) => ({ ...current, [person]: value }));
  const changeParticipants = (value) => setParticipantSel(value.length === people.length ? null : value);

  const submit = async (values) => {
    const amount = Number(values.amount);
    const problem = validateSplit(splitType, amount, participants, splitValues);
    if (problem) { notify.error(problem); return; }
    const previous = editingId === null ? null : expenses.find((item) => item.id === editingId);
    const now = new Date().toISOString();
    const expense = {
      id: previous?.id || makeId(),
      description: values.description.trim(),
      payer: values.payer,
      amount,
      splitType,
      splitDetails: computeSplit(splitType, amount, participants, splitValues),
      participants: [...participants],
      splitValues: splitType === 'equal' ? undefined : { ...splitValues },
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

  const edit = (id) => {
    const expense = expenses.find((item) => item.id === id);
    if (!expense) return;
    const details = expense.splitDetails || {};
    const shares = Object.values(details);
    const wasEqual = shares.length > 0
      && shares.every((share) => Math.abs(Number(share) - Number(expense.amount) / shares.length) < 0.01);
    const type = expense.splitType || (wasEqual ? 'equal' : 'unequal');
    // Older expenses have no stored participants: fall back to everyone who has a share.
    const stored = Array.isArray(expense.participants) && expense.participants.length
      ? expense.participants
      : Object.keys(details).filter((name) => Number(details[name]) > 0 || type !== 'equal');
    const restored = stored.filter((name) => people.includes(name));
    setEditingId(id);
    setSplitType(type);
    setParticipantSel(restored.length === people.length ? null : restored);
    if (expense.splitValues && type !== 'equal') setSplitValues({ ...expense.splitValues });
    else if (type === 'percentages') {
      setSplitValues(Object.fromEntries(people.map((person) => [
        person, expense.amount ? Math.round(((details[person] || 0) / expense.amount) * 10000) / 100 : 0,
      ])));
    } else if (type === 'shares') {
      setSplitValues(Object.fromEntries(people.map((person) => [person, details[person] || 0])));
    } else setSplitValues({ ...details });
    form.setFieldsValue({
      description: expense.description,
      payer: people.includes(expense.payer) ? expense.payer : undefined,
      amount: expense.amount,
      category: expense.category || 'Other',
      note: expense.note || '',
    });
    document.getElementById('add-expense')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };

  return {
    form, splitType, splitValues, participants, editingId, saving,
    reset, submit, edit, changeSplitType, setSplitValue, changeParticipants,
  };
}
