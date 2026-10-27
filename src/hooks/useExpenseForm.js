import { useState } from 'react';
import { computeSplit, validateSplit } from '../lib/splits';
import { makeId } from '../lib/storage';

const EMPTY_VALUES = {
  description: '', payer: '', amount: '', category: 'Other', note: '',
};

/**
 * State and handlers for adding/editing an expense (fields, split type, participants, per-person values).
 * `onSave(expense)` persists it and resolves to true when it was kept. `submit()` resolves to the saved
 * expense id, or null when validation failed or the save was refused.
 */
export function useExpenseForm({ people, expenses, onSave, notify }) {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [splitType, setSplitType] = useState('equal');
  const [splitValues, setSplitValues] = useState({});
  const [participantSel, setParticipantSel] = useState(null); // null means "everyone"
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const participants = (participantSel ?? people).filter((name) => people.includes(name));

  const reset = () => {
    setValues(EMPTY_VALUES);
    setErrors({});
    setSplitType('equal');
    setSplitValues({});
    setParticipantSel(null);
    setEditingId(null);
  };

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };
  const changeSplitType = (value) => { setSplitType(value); setSplitValues({}); setErrors((c) => ({ ...c, split: undefined })); };
  const setSplitValue = (person, value) => {
    setSplitValues((current) => ({ ...current, [person]: value }));
    setErrors((c) => (c.split ? { ...c, split: undefined } : c));
  };
  const changeParticipants = (value) => {
    setParticipantSel(value.length === people.length ? null : value);
    setErrors((c) => (c.split ? { ...c, split: undefined } : c));
  };

  const validate = () => {
    const found = {};
    if (!values.description.trim()) found.description = 'Add a short description';
    if (!values.payer || !people.includes(values.payer)) found.payer = 'Choose who paid';
    const amount = Number(values.amount);
    if (!values.amount || !Number.isFinite(amount) || amount < 0.01) found.amount = 'Enter the total';
    if (!found.amount) {
      const problem = validateSplit(splitType, amount, participants, splitValues);
      if (problem) found.split = problem;
    } else if (!participants.length) found.split = 'Choose at least one person to split between';
    setErrors(found);
    return found;
  };

  const submit = async () => {
    if (Object.keys(validate()).length) return null;
    const amount = Number(values.amount);
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
    if (!kept) return null;
    notify.success(previous ? 'Expense updated' : 'Expense added');
    reset();
    return expense.id;
  };

  const edit = (id) => {
    const expense = expenses.find((item) => item.id === id);
    if (!expense) return false;
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
    setErrors({});
    setValues({
      description: expense.description,
      payer: people.includes(expense.payer) ? expense.payer : '',
      amount: String(expense.amount),
      category: expense.category || 'Other',
      note: expense.note || '',
    });
    return true;
  };

  return {
    values, errors, splitType, splitValues, participants, editingId, saving,
    reset, submit, edit, setField, changeSplitType, setSplitValue, changeParticipants,
  };
}
