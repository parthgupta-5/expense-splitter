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

    await user.type(screen.getByLabelText('Add participant name'), 'Asha, Ben{Enter}');
    expect(await screen.findByText('Asha')).toBeTruthy();

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

  it('explains when a group link no longer works', async () => {
    renderAt('/groups/does-not-exist');
    expect(await screen.findByText('Group not found')).toBeTruthy();
  });
});
