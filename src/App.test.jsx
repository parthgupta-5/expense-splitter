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
import { STATE_KEY } from './lib/storage';
import {
  buttonIn, findButton, findHeading, preloadLazyModules,
} from './test/app';

vi.mock('./supabase', () => ({ supabase: null, supabaseConfigured: false, normalizeSupabaseUrl: () => '', supabaseUrl: '' }));

beforeAll(async () => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  await preloadLazyModules();
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

async function choose(label, option) {
  await userEvent.click(screen.getByLabelText(label));
  const options = await screen.findAllByTitle(option);
  await userEvent.click(options.at(-1));
}
// Dialogs by the title they show (Ant Design gives every element the same id under test).
const findDialog = async (title) => (await screen.findByText(title, { selector: '.ant-modal-title' })).closest('[role="dialog"]');

describe('App (guest mode)', () => {
  it('opens the first group, splits an expense and suggests the settlement', async () => {
    const user = userEvent.setup();
    renderAt('/');
    expect(await findHeading('My first group', 1)).toBeTruthy();

    // Guests (no account): "Add people" offers both choices, adding by username explains it needs an account.
    await user.click(buttonIn(document.querySelector('.people-card'), /add people/i));
    const dialog = (await screen.findByText('Add by username')).closest('[role="dialog"]');
    expect(Array.from(dialog.querySelectorAll('.ant-segmented-item-label'), (node) => node.textContent))
      .toEqual(['Add by username', 'Add guest']); // exactly two choices
    await user.type(within(dialog).getByLabelText('Guest name'), 'Asha, Ben{Enter}');
    expect(await screen.findByText('2 guests added')).toBeTruthy();
    await user.click(within(dialog).getAllByText('Add by username')[0]);
    expect(within(dialog).getByText(/sends them an invitation, so it needs an account/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(document.querySelectorAll('.people-rows .person-row')).toHaveLength(2));
    const rows = document.querySelector('.people-rows');
    expect(rows.getAttribute('aria-label')).toBe('Participants in My first group');
    const list = within(rows);
    expect(list.getByText('Asha')).toBeTruthy();
    expect(list.getByText('Ben')).toBeTruthy();
    // Everyone in a guest group is simply a name: no account statuses.
    expect(list.queryByText('Guest')).toBeNull();

    // Add expense is the page's main action; the form opens in a dialog.
    await user.click(buttonIn(document.querySelector('.group-toolbar'), /add expense/i));
    const form = within(await findDialog('Add an expense'));
    await user.type(form.getByLabelText(/what was it for/i), 'Dinner');
    await choose(/who paid/i, 'Asha');
    await user.type(form.getByLabelText(/total amount/i), '300');
    await user.click(form.getByRole('button', { name: /save expense/i }));

    // The row says who paid; the summary says who owes whom in words, not with a sign.
    const row = (await screen.findByText('Dinner')).closest('.expense-row');
    expect(row.textContent).toMatch(/Other · Paid by Asha · Split equally/);
    expect(row.querySelector('.money-row-amount').textContent).toBe('₹300.00');
    const summary = document.querySelector('.group-summary');
    expect(summary.textContent).toMatch(/Group spend₹300\.00/);
    expect(summary.textContent).toMatch(/Participants2/);
    expect(summary.textContent).toMatch(/To settleBen owes Asha ₹150\.00/);

    await user.click(within(summary).getByRole('button', { name: 'View balances' }));
    const box = await screen.findByText('Settle up');
    const settlement = within(box.closest('.settlement-box'));
    expect(settlement.getByText('Ben')).toBeTruthy();
    expect(settlement.getByText('pays')).toBeTruthy();
    expect(settlement.getByText('₹150.00')).toBeTruthy();
    expect(settlement.getByRole('button', { name: /copy settlement/i })).toBeTruthy();
    const balances = document.querySelector('.balances-table').textContent;
    expect(balances).toMatch(/Is owed ₹150\.00/);
    expect(balances).toMatch(/Owes ₹150\.00/);
  }, 60000);

  it('refuses to edit an old expense that involves someone who was removed, so no balance changes', async () => {
    const user = userEvent.setup();
    // Dee shared a ₹300 dinner, paid her ₹100 back and was then removed (allowed: she was settled up).
    localStorage.setItem(STATE_KEY, JSON.stringify({
      groups: [{
        id: 'trip',
        name: 'Trip',
        currencyCode: 'INR',
        people: ['Asha', 'Ben'],
        expenses: [{
          id: 'e1', description: 'Dinner', payer: 'Asha', amountCents: 30000, category: 'Other', splitType: 'equal',
          splitCents: { Asha: 10000, Ben: 10000, Dee: 10000 }, participants: ['Asha', 'Ben', 'Dee'], createdAt: '2026-10-01T00:00:00.000Z',
        }],
        payments: [{ id: 'p1', payer: 'Dee', payee: 'Asha', amountCents: 10000, createdAt: '2026-10-02T00:00:00.000Z' }],
        savedSplits: [],
      }],
    }));
    const stored = () => JSON.parse(localStorage.getItem(STATE_KEY)).groups[0];
    renderAt('/groups/trip');
    expect(await findHeading('Trip', 1)).toBeTruthy();
    const before = JSON.stringify(stored()); // as the app saved it on this device
    const summary = document.querySelector('.group-summary');
    expect(summary.textContent).toMatch(/To settleBen owes Asha ₹100\.00/);

    await user.click(buttonIn(document.querySelector('.expense-row'), 'Edit Dinner'));
    expect(await screen.findByText('This expense involves Dee, who was removed. Add them back before editing this expense.')).toBeTruthy();
    // The form never opened, nothing was saved, and the history and balances are exactly as they were.
    expect(screen.queryByText('Edit expense', { selector: '.ant-modal-title' })).toBeNull();
    expect(JSON.stringify(stored())).toBe(before);
    expect(stored().expenses[0].splitCents).toEqual({ Asha: 10000, Ben: 10000, Dee: 10000 });
    expect(summary.textContent).toMatch(/To settleBen owes Asha ₹100\.00/);
    expect(document.querySelector('.expense-row').textContent).toMatch(/Dee ₹100\.00/);
  });

  it('navigates with real URLs and shows a 404 for unknown pages', async () => {
    const user = userEvent.setup();
    renderAt('/nowhere');
    expect(await screen.findByText('Page not found')).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    await user.click(nav.getByRole('link', { name: /groups/i }));
    expect(await findHeading('Your groups', 1)).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('Your groups · Expense Splitter'));
  });

  it('keeps the guest account pages: /profile explains accounts, Settings offers sign-in and backup', async () => {
    renderAt('/profile');
    expect(await findHeading('Your account', 1)).toBeTruthy();
    cleanup();
    renderAt('/settings');
    expect(await findHeading('Settings', 1)).toBeTruthy();
    expect((await findButton('Sign in or create account')).closest('.settings-section').id).toBe('account');
    expect(buttonIn(document.getElementById('data'), /download backup/i)).toBeTruthy();
    expect(document.querySelector('.account-card')).toBeNull();
    expect(screen.queryByText('Choose your username')).toBeNull();
    // Guests have no profile photo to manage.
    expect(screen.queryByRole('button', { name: /upload photo/i })).toBeNull();
    expect(screen.queryByLabelText('Profile photo file')).toBeNull();
    cleanup();
    // Guests have no cloud invitations to receive.
    renderAt('/groups');
    expect(await findHeading('Your groups', 1)).toBeTruthy();
    expect(screen.queryByText(/Invitations for you/)).toBeNull();
  });

  it('explains when a group link no longer works', async () => {
    renderAt('/groups/does-not-exist');
    expect(await screen.findByText('Group not found')).toBeTruthy();
  });
});
