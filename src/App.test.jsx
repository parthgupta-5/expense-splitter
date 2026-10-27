// @vitest-environment jsdom
// Whole-app test in guest mode: routing, adding people and an expense, the settlement, and the 404 page.
import React from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';

vi.mock('./supabase', () => ({ supabase: null, supabaseConfigured: false, normalizeSupabaseUrl: () => '' }));

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
});
afterEach(cleanup);

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /></AppProvider>
  </MemoryRouter>,
);

describe('App (guest mode)', () => {
  it('opens the first group, splits an expense and settles the suggested payment', async () => {
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'My first group' })).toBeTruthy();

    await user.type(screen.getByLabelText('Add participant name'), 'Asha, Ben{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Add expense' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'Add an expense' }));
    await user.type(sheet.getByLabelText('Total amount'), '300');
    await user.type(sheet.getByLabelText('What was it for?'), 'Dinner');
    await user.click(sheet.getByRole('radio', { name: /Asha/ }));
    await user.click(sheet.getByRole('button', { name: /add expense/i }));

    const ledger = await screen.findByRole('list', { name: 'Expenses' });
    expect(within(ledger).getByText('Dinner')).toBeTruthy();
    const balances = within(screen.getByRole('list', { name: 'Balances' }));
    expect(balances.getByText('is owed')).toBeTruthy();
    expect(balances.getByText('+₹150.00')).toBeTruthy();
    expect(balances.getByText('−₹150.00')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^settle up/i }));
    const settle = within(await screen.findByRole('dialog', { name: 'Settle up' }));
    await user.click(settle.getByRole('button', { name: 'Mark paid: Ben pays Asha ₹150.00' }));

    const payment = within(await screen.findByRole('dialog', { name: 'Record a payment' }));
    expect(payment.getByLabelText('From').value).toBe('Ben');
    expect(payment.getByLabelText('To').value).toBe('Asha');
    expect(payment.getByLabelText('Payment amount').value).toBe('150.00');
    await user.click(payment.getByRole('button', { name: 'Record payment' }));

    expect(await settle.findByText('Everyone is square. Nothing left to pay.')).toBeTruthy();
  }, 60000);

  it('asks before recording a payment larger than what is owed', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'My first group' });
    await user.type(screen.getByLabelText('Add participant name'), 'Asha, Ben{Enter}');
    await user.click(await screen.findByRole('button', { name: /^settle up/i }));
    const settle = within(await screen.findByRole('dialog', { name: 'Settle up' }));
    await user.click(settle.getByRole('button', { name: /record a different payment/i }));
    const payment = within(await screen.findByRole('dialog', { name: 'Record a payment' }));
    await user.click(payment.getByRole('button', { name: 'Record payment' }));
    expect(await payment.findByText('Choose who paid')).toBeTruthy();
    await user.selectOptions(payment.getByLabelText('From'), 'Ben');
    await user.selectOptions(payment.getByLabelText('To'), 'Asha');
    await user.type(payment.getByLabelText('Payment amount'), '40');
    await user.click(payment.getByRole('button', { name: 'Record payment' }));
    // Ant Design gives every dialog the same id under test, so find this one by its text.
    const confirm = within((await screen.findByText('This is more than the current balance')).closest('[role="dialog"]'));
    await user.click(confirm.getByRole('button', { name: 'Record anyway' }));
    expect(await screen.findByText('Payment recorded')).toBeTruthy();
  }, 60000);

  it('navigates with real URLs and shows a 404 for unknown pages', async () => {
    const user = userEvent.setup();
    renderAt('/nowhere');
    expect(await screen.findByText('Page not found')).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    await user.click(nav.getByRole('link', { name: /groups/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('Your groups · Expense Splitter'));
  });

  it('explains when a group link no longer works', async () => {
    renderAt('/groups/does-not-exist');
    expect(await screen.findByText('Group not found')).toBeTruthy();
  });
});
