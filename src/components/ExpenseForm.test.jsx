// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseSheet from './ExpenseForm';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { formatCurrency } from '../lib/currency';

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

const people = ['Asha', 'Ben', 'Chitra'];
const notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

function Harness({ onSave }) {
  const expenseForm = useExpenseForm({ people, expenses: [], notify, onSave });
  return (
    <ExpenseSheet
      open
      onClose={() => {}}
      expenseForm={expenseForm}
      people={people}
      currencySymbol="₹"
      formatMoney={(value) => formatCurrency(value, 'INR')}
    />
  );
}

const openSheet = async (onSave = vi.fn()) => {
  render(<Harness onSave={onSave} />);
  return within(await screen.findByRole('dialog', { name: 'Add an expense' }));
};

describe('ExpenseSheet', () => {
  it('shows required-field errors and saves nothing when empty', async () => {
    const onSave = vi.fn();
    const sheet = await openSheet(onSave);
    await userEvent.click(sheet.getByRole('button', { name: /add expense/i }));
    expect(await sheet.findByText('Add a short description')).toBeTruthy();
    expect(sheet.getByText('Choose who paid')).toBeTruthy();
    expect(sheet.getByText('Enter the total')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the split editor for non-equal split methods only', async () => {
    const sheet = await openSheet();
    expect(sheet.queryByText('Set shares for each person')).toBeNull();
    await userEvent.click(sheet.getByRole('radio', { name: 'By shares' }));
    expect(await sheet.findByText('Set shares for each person')).toBeTruthy();
    expect(sheet.getByLabelText('Asha shares')).toBeTruthy();
  });

  it('saves an equal split whose parts add up to the total', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const sheet = await openSheet(onSave);
    await userEvent.type(sheet.getByLabelText('Total amount'), '100');
    await userEvent.type(sheet.getByLabelText('What was it for?'), 'Taxi');
    await userEvent.click(sheet.getByRole('radio', { name: /Asha/ }));
    await userEvent.click(sheet.getByRole('button', { name: /add expense/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ description: 'Taxi', payer: 'Asha', amount: 100, splitType: 'equal' });
    const cents = Object.values(saved.splitDetails).map((value) => Math.round(value * 100));
    expect(cents.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('refuses custom amounts that do not add up to the total', async () => {
    const onSave = vi.fn();
    const sheet = await openSheet(onSave);
    await userEvent.type(sheet.getByLabelText('Total amount'), '90');
    await userEvent.type(sheet.getByLabelText('What was it for?'), 'Tickets');
    await userEvent.click(sheet.getByRole('radio', { name: /Ben/ }));
    await userEvent.click(sheet.getByRole('radio', { name: 'Custom amounts' }));
    await userEvent.type(sheet.getByLabelText('Asha amount'), '10');
    await userEvent.click(sheet.getByRole('button', { name: /add expense/i }));
    expect(await sheet.findByText('Split amounts must add up to the expense total')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
