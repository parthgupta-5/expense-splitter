// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

function Harness({ onSave }) {
  const [messageApi] = message.useMessage();
  const expenseForm = useExpenseForm({
    people, expenses: [], messageApi, setExpenses: (updater) => onSave(updater([])),
  });
  return <ExpenseForm expenseForm={expenseForm} people={people} currencySymbol="₹" />;
}

const renderForm = (onSave) => render(<AntApp><Harness onSave={onSave} /></AntApp>);

describe('ExpenseForm', () => {
  it('shows required-field errors and saves nothing when empty', async () => {
    const onSave = vi.fn();
    renderForm(onSave);
    await userEvent.click(screen.getByRole('button', { name: /add expense/i }));
    expect(await screen.findByText('Add a short description')).toBeTruthy();
    expect(screen.getByText('Choose who paid')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the split editor for non-equal split methods only', async () => {
    renderForm(vi.fn());
    expect(screen.queryByText('Set shares for each person')).toBeNull();
    await userEvent.click(screen.getByText('Equal'));
    await userEvent.click(await screen.findByTitle('By shares'));
    expect(await screen.findByText('Set shares for each person')).toBeTruthy();
  });
});
