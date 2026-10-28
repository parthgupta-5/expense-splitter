// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, message } from 'antd';
import ExpenseForm from './ExpenseForm';
import { useExpenseForm } from '../hooks/useExpenseForm';

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

const people = ['Asha', 'Ben', 'Chitra'];

function Harness({ onSave, expenses = [], names = people }) {
  const [notify, messageHolder] = message.useMessage();
  const expenseForm = useExpenseForm({
    people: names, expenses, notify, onSave,
  });
  return (
    <>
      {messageHolder}
      <ExpenseForm expenseForm={expenseForm} people={names} currencySymbol="₹" />
      {expenses.map((expense) => (
        <button key={expense.id} type="button" onClick={() => expenseForm.edit(expense.id)}>Edit {expense.description}</button>
      ))}
    </>
  );
}

const renderForm = (onSave, expenses, names) => render(
  <AntApp><Harness onSave={onSave} expenses={expenses} names={names} /></AntApp>,
);
const amountField = () => screen.getByLabelText(/total amount/i);
// Per-person fields in the split editor (the payer list also mentions each name).
const splitField = (person) => within(document.querySelector('.split-editor')).getByLabelText(person);

async function choose(user, label, option) {
  await user.click(screen.getByLabelText(label));
  const options = await screen.findAllByTitle(option);
  await user.click(options.at(-1));
}

async function fillBasics(user, amount) {
  await user.type(screen.getByLabelText(/what was it for/i), 'Dinner');
  await choose(user, /who paid/i, 'Asha');
  await user.type(amountField(), amount);
}

describe('ExpenseForm', () => {
  it('shows required-field errors and saves nothing when empty', async () => {
    const onSave = vi.fn();
    renderForm(onSave);
    await userEvent.click(screen.getByRole('button', { name: /save expense/i }));
    expect(await screen.findByText('Add a short description')).toBeTruthy();
    expect(screen.getByText('Choose who paid')).toBeTruthy();
    expect(screen.getByText('Enter the total')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the split editor for non-equal split methods only', async () => {
    renderForm(vi.fn());
    expect(screen.queryByText('Set shares for each person')).toBeNull();
    await userEvent.click(screen.getByText('Equal'));
    await userEvent.click(await screen.findByTitle('By shares'));
    expect(await screen.findByText('Set shares for each person')).toBeTruthy();
  });

  it('marks the split method as required, with Equal chosen and labelled as the default', async () => {
    const user = userEvent.setup();
    renderForm(vi.fn());
    const method = screen.getByLabelText('Split method');
    expect(screen.getByText('Split method').closest('label').classList).toContain('ant-form-item-required');
    expect(method.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('Equal')).toBeTruthy();
    expect(screen.getAllByText('default')).toHaveLength(1); // next to the chosen value
    await user.click(method);
    await screen.findByTitle('Custom amounts');
    expect(screen.getAllByText('default')).toHaveLength(2); // and next to Equal in the list
  });

  it('uses a decimal keypad and has no stepper or arrow-key adjustment', async () => {
    const user = userEvent.setup();
    renderForm(vi.fn());
    const amount = amountField();
    expect(amount.getAttribute('inputmode')).toBe('decimal');
    expect(amount.getAttribute('type')).toBe('text');
    expect(screen.queryByRole('spinbutton', { name: /total amount/i })).toBeNull();
    expect(document.querySelector('.ant-input-number-handler-wrap, .ant-input-number-action')).toBeNull();
    await user.type(amount, '10.5{ArrowUp}{ArrowUp}{ArrowDown}');
    expect(amount.value).toBe('10.5');
  });

  it('rejects more than two decimal places instead of rounding, and saves nothing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderForm(onSave);
    await fillBasics(user, '10.555');
    expect(await screen.findByText('Use at most 2 decimal places')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /save expense/i }));
    expect(amountField().value).toBe('10.555');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the total and every share as integer cents', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    renderForm(onSave);
    await fillBasics(user, '10.55');
    await user.click(screen.getByRole('button', { name: /save expense/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [expense] = onSave.mock.calls[0];
    expect(expense).toMatchObject({
      amountCents: 1055, splitType: 'equal', splitCents: { Asha: 352, Ben: 352, Chitra: 351 },
    });
    expect(expense).not.toHaveProperty('amount');
    expect(Object.values(expense.splitCents).every(Number.isSafeInteger)).toBe(true);
  });

  it('takes custom amounts as two-decimal money that must add up exactly', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    renderForm(onSave);
    await fillBasics(user, '10');
    await choose(user, 'Split method', 'Custom amounts');
    const asha = splitField('Asha');
    expect(asha.getAttribute('inputmode')).toBe('decimal');
    await user.type(asha, '3.335');
    expect(await screen.findByText('Use at most 2 decimal places')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /save expense/i }));
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(asha);
    await user.type(asha, '3.34');
    await user.type(splitField('Ben'), '3.33');
    await user.type(splitField('Chitra'), '3.33');
    await user.click(screen.getByRole('button', { name: /save expense/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [expense] = onSave.mock.calls[0];
    expect(expense).toMatchObject({ amountCents: 1000, splitType: 'unequal', splitCents: { Asha: 334, Ben: 333, Chitra: 333 } });
    expect(expense.splitValues).toBeUndefined();
  });

  it('keeps By shares: editing a saved shares expense restores its weights and amount', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    const saved = {
      id: 'old', description: 'Hotel', payer: 'Ben', amountCents: 9000, splitType: 'shares',
      splitCents: { Asha: 3000, Ben: 6000, Chitra: 0 }, participants: people, splitValues: { Asha: 1, Ben: 2, Chitra: 0 },
      category: 'Stay', createdAt: '2026-01-01T00:00:00.000Z',
    };
    renderForm(onSave, [saved]);
    await user.click(screen.getByRole('button', { name: 'Edit Hotel' }));
    expect(await screen.findByText('Set shares for each person')).toBeTruthy();
    expect(amountField().value).toBe('90.00');
    expect(splitField('Ben').value).toMatch(/^2(\.0+)?$/);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: 'old', amountCents: 9000, splitType: 'shares', splitCents: { Asha: 3000, Ben: 6000, Chitra: 0 },
      splitValues: { Asha: 1, Ben: 2, Chitra: 0 }, createdAt: saved.createdAt,
    });
  });

  // Dee shared this dinner, was settled up and then removed from the group.
  const withDee = {
    id: 'old', description: 'Dinner', payer: 'Asha', amountCents: 40000, splitType: 'equal', category: 'Other',
    splitCents: {
      Asha: 10000, Ben: 10000, Chitra: 10000, Dee: 10000,
    },
    participants: [...people, 'Dee'],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('refuses to edit an expense that involves someone who was removed, instead of re-splitting it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    renderForm(onSave, [withDee]);
    await user.click(screen.getByRole('button', { name: 'Edit Dinner' }));
    expect(await screen.findByText('This expense involves Dee, who was removed. Add them back before editing this expense.')).toBeTruthy();
    // The form stays empty and in "add" mode: the old expense was never loaded, so it cannot be saved re-split.
    expect(amountField().value).toBe('');
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses to save an edit when someone in it was removed while the form was open', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    const before = { ...withDee, splitCents: { Asha: 20000, Ben: 10000, Chitra: 10000 }, participants: people };
    const { rerender } = renderForm(onSave, [before]);
    await user.click(screen.getByRole('button', { name: 'Edit Dinner' }));
    expect(amountField().value).toBe('400.00');
    // Another member removes Chitra (settled) while this form is open.
    rerender(<AntApp><Harness onSave={onSave} expenses={[before]} names={['Asha', 'Ben']} /></AntApp>);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('This expense involves Chitra, who was removed. Add them back before editing this expense.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
