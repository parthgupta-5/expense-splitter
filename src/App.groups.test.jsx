// @vitest-environment jsdom
// Readable group addresses (/groups/goa-trip) in guest mode: the real App, router and workspace.
import React from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';
import { STATE_KEY, newGroup } from './lib/storage';

vi.mock('./supabase', () => ({ supabase: null, supabaseConfigured: false, normalizeSupabaseUrl: () => '', supabaseUrl: '' }));

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});

const saved = [
  { ...newGroup('Goa Trip'), id: 'id-goa-1', createdAt: '2026-01-01T00:00:00.000Z' },
  { ...newGroup('Goa Trip'), id: 'id-goa-2', createdAt: '2026-02-01T00:00:00.000Z' },
  { ...newGroup('Flat Rent'), id: 'id-rent', createdAt: '2026-03-01T00:00:00.000Z' },
];

beforeEach(() => {
  const store = new Map([[STATE_KEY, JSON.stringify({ groups: saved })]]);
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
});
afterEach(cleanup);

function Location() {
  const { pathname } = useLocation();
  return <output data-testid="location">{pathname}</output>;
}
const here = () => screen.getByTestId('location').textContent;
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /><Location /></AppProvider>
  </MemoryRouter>,
);
const heading = (name) => screen.findByRole('heading', { level: 1, name });

describe('group addresses', () => {
  it('opens a group from its readable address', async () => {
    renderAt('/groups/flat-rent');
    expect(await heading('Flat Rent')).toBeTruthy();
    expect(here()).toBe('/groups/flat-rent');
  });

  it('numbers groups with the same name, the older one keeping the plain name', async () => {
    renderAt('/groups/goa-trip-2');
    expect(await heading('Goa Trip')).toBeTruthy();
    expect(here()).toBe('/groups/goa-trip-2');
    cleanup();
    renderAt('/groups/goa-trip');
    expect(await heading('Goa Trip')).toBeTruthy();
    expect(here()).toBe('/groups/goa-trip');
  });

  it('turns an old /groups/<id> link into the readable address', async () => {
    renderAt('/groups/id-rent');
    expect(await heading('Flat Rent')).toBeTruthy();
    await waitFor(() => expect(here()).toBe('/groups/flat-rent'));
    cleanup();
    renderAt('/groups/id-goa-2');
    await waitFor(() => expect(here()).toBe('/groups/goa-trip-2'));
  });

  it('opens a group from the groups list with its readable address', async () => {
    const user = userEvent.setup();
    renderAt('/groups');
    const card = (await screen.findByText('Flat Rent')).closest('.group-card');
    await user.click(within(card).getByRole('button', { name: /open/i }));
    await waitFor(() => expect(here()).toBe('/groups/flat-rent'));
  });

  it('follows a rename: the address changes and the page stays open', async () => {
    const user = userEvent.setup();
    renderAt('/groups/flat-rent');
    await heading('Flat Rent');
    await user.click(screen.getByRole('button', { name: /group settings/i }));
    const dialog = (await screen.findAllByRole('dialog')).find((item) => within(item).queryByText('Group settings'));
    const name = within(dialog).getByLabelText(/group name/i);
    await user.clear(name);
    await user.type(name, 'Home bills');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await heading('Home bills')).toBeTruthy();
    await waitFor(() => expect(here()).toBe('/groups/home-bills'));
    expect(screen.queryByText('Group not found')).toBeNull();
  });

  it('shows "Group not found" for an unknown address, and the root opens the last group readably', async () => {
    renderAt('/groups/nope');
    expect(await screen.findByText('Group not found')).toBeTruthy();
    cleanup();
    renderAt('/');
    await waitFor(() => expect(here()).toMatch(/^\/groups\/(goa-trip|goa-trip-2|flat-rent)$/));
  });
});
