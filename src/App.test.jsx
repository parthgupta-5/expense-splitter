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

vi.mock('./supabase', () => ({ supabase: null, supabaseConfigured: false, normalizeSupabaseUrl: () => '', supabaseUrl: '' }));

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

async function choose(label, option) {
  await userEvent.click(screen.getByLabelText(label));
  const options = await screen.findAllByTitle(option);
  await userEvent.click(options.at(-1));
}

describe('App (guest mode)', () => {
  it('opens the first group, splits an expense and suggests the settlement', async () => {
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'My first group' })).toBeTruthy();

    // Guests (no account): "Add people" offers both choices, adding by username explains it needs an account.
    await user.click(screen.getByRole('button', { name: /add people/i }));
    const dialog = (await screen.findByText('Add by username')).closest('[role="dialog"]');
    expect(Array.from(dialog.querySelectorAll('.ant-segmented-item-label'), (node) => node.textContent))
      .toEqual(['Add by username', 'Add guest']); // exactly two choices
    await user.type(within(dialog).getByLabelText('Guest name'), 'Asha, Ben{Enter}');
    expect(await screen.findByText('2 guests added')).toBeTruthy();
    await user.click(within(dialog).getAllByText('Add by username')[0]);
    expect(within(dialog).getByText(/sends them an invitation, so it needs an account/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    const list = within(await screen.findByRole('list', { name: 'People in My first group' }));
    expect(list.getByText('Asha')).toBeTruthy();
    expect(list.getByText('Ben')).toBeTruthy();
    // Everyone in a guest group is simply a name: no account statuses.
    expect(list.queryByText('Guest')).toBeNull();

    await user.type(screen.getByLabelText(/what was it for/i), 'Dinner');
    await choose(/who paid/i, 'Asha');
    await user.type(screen.getByLabelText(/total amount/i), '300');
    await user.click(screen.getByRole('button', { name: /add expense/i }));

    expect(await screen.findByText('Dinner')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /balances/i }));
    const box = await screen.findByText('Settle up');
    const settlement = within(box.closest('.settlement-box'));
    expect(settlement.getByText('Ben')).toBeTruthy();
    expect(settlement.getByText('₹150.00')).toBeTruthy();
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

  it('keeps the guest account pages: /profile explains accounts, Settings offers sign-in and backup', async () => {
    renderAt('/profile');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeTruthy();
    cleanup();
    renderAt('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in or create account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /download backup/i })).toBeTruthy();
    expect(document.querySelector('.account-card')).toBeNull();
    expect(screen.queryByText('Choose your username')).toBeNull();
    // Guests have no profile photo to manage.
    expect(screen.queryByRole('button', { name: /upload photo/i })).toBeNull();
    expect(screen.queryByLabelText('Profile photo file')).toBeNull();
    cleanup();
    // Guests have no cloud invitations to receive.
    renderAt('/groups');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeTruthy();
    expect(screen.queryByText(/Invitations for you/)).toBeNull();
  });

  it('explains when a group link no longer works', async () => {
    renderAt('/groups/does-not-exist');
    expect(await screen.findByText('Group not found')).toBeTruthy();
  });
});
