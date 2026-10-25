import { useState } from 'react';
import { Form } from 'antd';
import { computeSplit, validateSplit } from '../lib/splits';
import { makeId } from '../lib/storage';

/** State and handlers for adding/editing an expense (split type, participants, per-person values). */
export function useExpenseForm({ people, expenses, setExpenses, messageApi }) {
  const [form] = Form.useForm();
  const [splitType, setSplitType] = useState('equal');
  const [splitValues, setSplitValues] = useState({});
  const [participantSel, setParticipantSel] = useState(null); // null means "everyone"
  const [editingIndex, setEditingIndex] = useState(null);

  const participants = (participantSel ?? people).filter((name) => people.includes(name));

  const reset = () => {
    form.resetFields();
    setSplitType('equal');
    setSplitValues({});
    setParticipantSel(null);
    setEditingIndex(null);
  };

  const changeSplitType = (value) => { setSplitType(value); setSplitValues({}); };
  const setSplitValue = (person, value) => setSplitValues((current) => ({ ...current, [person]: value }));
  const changeParticipants = (value) => setParticipantSel(value.length === people.length ? null : value);

  const submit = (values) => {
    const amount = Number(values.amount);
    const problem = validateSplit(splitType, amount, participants, splitValues);
    if (problem) { messageApi.error(problem); return; }
    const previous = editingIndex === null ? null : expenses[editingIndex];
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
    setExpenses((current) => (editingIndex === null
      ? [expense, ...current]
      : current.map((item, index) => (index === editingIndex ? expense : item))));
    messageApi.success(editingIndex === null ? 'Expense added' : 'Expense updated');
    reset();
  };

  const edit = (index) => {
    const expense = expenses[index];
    const details = expense.splitDetails || {};
    const shares = Object.values(details);
    const wasEqual = shares.length > 0
      && shares.every((share) => Math.abs(Number(share) - Number(expense.amount) / shares.length) < 0.01);
    const type = expense.splitType || (wasEqual ? 'equal' : 'unequal');
    // Older expenses have no stored participants: fall back to everyone who has a share.
    const stored = Array.isArray(expense.participants)
      ? expense.participants
      : Object.keys(details).filter((name) => Number(details[name]) > 0 || type !== 'equal');
    const restored = stored.filter((name) => people.includes(name));
    setEditingIndex(index);
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
      payer: expense.payer,
      amount: expense.amount,
      category: expense.category || 'Other',
      note: expense.note || '',
    });
    document.getElementById('add-expense')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return {
    form, splitType, splitValues, participants, editingIndex,
    reset, submit, edit, changeSplitType, setSplitValue, changeParticipants,
  };
}
