// @vitest-environment jsdom
// First-time guidance, empty states and the public policy pages: the real App, router and workspace, with the session
// and Supabase data layer mocked for signed-in cases and plain device storage for guests.
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
import * as repo from './data/cloudRepo';
import { STATE_KEY, newGroup } from './lib/storage';

const mocks = vi.hoisted(() => ({ auth: {}, configured: true }));

vi.mock('./supabase', () => ({
  supabase: null,
  get supabaseConfigured() { return mocks.configured; },
  normalizeSupabaseUrl: () => '',
  supabaseUrl: '',
}));
vi.mock('./state/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./data/cloudRepo', () => ({
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  subscribeToChanges: vi.fn(),
  fetchActivity: vi.fn(),
  importGroup: vi.fn(),
  listMyInvitations: vi.fn(),
  listGroupPeople: vi.fn(),
  accountDeletionBlockers: vi.fn(),
  checkUsername: vi.fn(),
  suggestUsername: vi.fn(),
}));

const ME = 'user-1';
const profile = (extra = {}) => ({
  id: ME, display_name: 'Asha', username: 'asha_rao', username_confirmed_at: '2026-10-01', saved_people: [], preferences: {}, ...extra,
});
const cloudGroup = (extra = {}) => ({
  ...newGroup('Goa trip'),
  id: 'g-1',
  people: ['Asha', 'Ben'],
  personRecords: [{ id: 'p-1', name: 'Asha', userId: ME }, { id: 'p-2', name: 'Ben', userId: null }],
  ownerId: ME,
  role: 'owner',
  memberCount: 1,
  cloud: true,
  ...extra,
});
const signIn = ({ groups = [], prof = profile() } = {}) => {
  mocks.auth = {
    user: { id: ME, email: 'asha@example.com', user_metadata: {}, app_metadata: { providers: ['email'] } },
    ready: true,
    recovering: false,
    signOut: () => Promise.resolve(),
    updateDisplayName: () => Promise.resolve(),
  };
  repo.fetchGroups.mockResolvedValue(groups);
  repo.fetchProfile.mockResolvedValue(prof);
};
const asGuest = () => {
  mocks.auth = {
    user: null, ready: true, recovering: false, signOut: () => Promise.resolve(), updateDisplayName: () => Promise.resolve(),
  };
};

let store;
beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  mocks.configured = true;
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.fetchActivity.mockResolvedValue([]);
  repo.listMyInvitations.mockResolvedValue([]);
  repo.listGroupPeople.mockResolvedValue([]);
  repo.accountDeletionBlockers.mockResolvedValue([]);
  repo.saveProfile.mockResolvedValue();
  repo.suggestUsername.mockResolvedValue('asharao');
  repo.checkUsername.mockResolvedValue('available');
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /><Location /></AppProvider>
  </MemoryRouter>,
);
const welcome = () => document.querySelector('.welcome-panel');

describe('first-time welcome (signed in)', () => {
  it('greets a new account with no groups, explains the steps and offers to create the first group', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt('/');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/groups'));
    const panel = within(await screen.findByRole('heading', { level: 2, name: 'Welcome to Expense Splitter' }).then((h) => h.closest('.welcome-panel')));
    expect(panel.getByText(/You are added automatically\. Add friends by their @username/)).toBeTruthy();
    expect(panel.getByText(/Settle up/)).toBeTruthy();
    expect(screen.queryByText(/No groups yet/)).toBeNull(); // the welcome replaces the empty state
    await user.click(panel.getByRole('button', { name: /create your first group/i }));
    expect(await screen.findByText('Create a group')).toBeTruthy();
  });

  it('can be dismissed for good: saved in the account, not shown again, the empty state takes over', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt('/groups');
    const panel = within((await screen.findByText('Welcome to Expense Splitter')).closest('.welcome-panel'));
    await user.click(panel.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(welcome()).toBeNull());
    expect(screen.getByText(/No groups yet\. Create one for a trip/)).toBeTruthy();
    await waitFor(() => expect(repo.saveProfile).toHaveBeenCalledWith(ME, expect.objectContaining({
      preferences: expect.objectContaining({ welcomeDismissed: true }),
    })));

    cleanup();
    signIn({ prof: profile({ preferences: { welcomeDismissed: true } }) });
    renderAt('/groups');
    expect(await screen.findByText(/No groups yet/)).toBeTruthy();
    expect(welcome()).toBeNull();
  });

  it('is not shown to an account that already has groups, and mentions a waiting invitation', async () => {
    signIn({ groups: [cloudGroup()] });
    renderAt('/groups');
    expect(await screen.findByText('Goa trip')).toBeTruthy();
    expect(welcome()).toBeNull();

    cleanup();
    signIn();
    repo.listMyInvitations.mockResolvedValue([{
      id: 'i-1', group_id: 'g-9', group_name: 'Flat', person_name: 'Asha', invited_by_name: 'Ben', invited_by_username: 'ben_k', status: 'pending',
    }]);
    renderAt('/groups');
    expect(await screen.findByText(/You also have an invitation waiting/)).toBeTruthy();
  });
});

describe('first-time welcome (guest)', () => {
  it('explains that data stays on this device, without promising sharing, and goes away once dismissed', async () => {
    const user = userEvent.setup();
    mocks.configured = false;
    asGuest();
    renderAt('/');
    const panel = within((await screen.findByText('Welcome to Expense Splitter')).closest('.welcome-panel'));
    expect(panel.getByText(/saved on this device only/)).toBeTruthy();
    expect(panel.getByText(/Add everyone who shares the costs, by name/)).toBeTruthy();
    expect(panel.queryByText(/@username/)).toBeNull();
    expect(panel.queryByRole('button', { name: /create your first group/i })).toBeNull();
    await user.click(panel.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(welcome()).toBeNull());
    await waitFor(() => expect(JSON.parse(store.get(STATE_KEY)).preferences.welcomeDismissed).toBe(true));
  });

  it('is not shown on a device that already has data', async () => {
    asGuest();
    store.set(STATE_KEY, JSON.stringify({ groups: [{ ...newGroup('Old trip'), people: ['Asha'] }] }));
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Old trip' })).toBeTruthy();
    expect(welcome()).toBeNull();
  });
});

describe('empty states', () => {
  it('a group with no expenses explains what to do and offers one clear action', async () => {
    const user = userEvent.setup();
    signIn({ groups: [cloudGroup()] });
    renderAt('/groups/goa-trip');
    const empty = (await screen.findByText(/No expenses yet\. Record the first one/)).closest('.ant-empty');
    await user.click(within(empty).getByRole('button', { name: 'Add an expense' }));
    await waitFor(() => expect(document.activeElement?.closest('#add-expense')).toBeTruthy());
  });

  it('a group with nobody in it says who to add', async () => {
    signIn({ groups: [cloudGroup({ people: [], personRecords: [] })] });
    renderAt('/groups/goa-trip');
    expect(await screen.findByText(/No one here yet\. Add the people who share costs/)).toBeTruthy();
  });

  it('history with nothing in it points back to the groups', async () => {
    const user = userEvent.setup();
    signIn({ groups: [cloudGroup()] });
    renderAt('/history');
    const empty = (await screen.findByText(/No history yet/)).closest('.ant-empty');
    await user.click(within(empty).getByRole('button', { name: 'Go to your groups' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/groups'));
  });
});

describe('privacy policy and terms', () => {
  it('are public pages with honest, specific content', async () => {
    asGuest();
    renderAt('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByText('A plain-language policy for a project app, not legal advice.')).toBeTruthy();
    const deletion = document.getElementById('deletion');
    expect(deletion.textContent).toMatch(/Former member/);
    expect(deletion.textContent).toMatch(/own a group that other members use/);
    expect(deletion.textContent).toMatch(/we cannot give a specific period/);
    expect(document.getElementById('visibility').textContent).toMatch(/Email addresses are never shown to other users/);
    expect(document.body.textContent).not.toMatch(/GDPR|encrypted at rest|certified/i);
    expect(document.title).toBe('Privacy Policy · Expense Splitter');

    cleanup();
    renderAt('/terms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy();
    expect(document.getElementById('service').textContent).toMatch(/does not move money/);
  });

  it('are linked from every page footer, Settings and the sign-up form', async () => {
    const user = userEvent.setup();
    asGuest();
    renderAt('/settings');
    const footer = within(await screen.findByRole('navigation', { name: 'Policies' }));
    expect(footer.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(footer.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    const settings = within((await screen.findByText('Privacy and terms')).closest('.setting-card'));
    expect(settings.getByRole('link', { name: 'Privacy Policy' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Sign in or create account' }));
    const form = (await screen.findByText(/By creating an account you agree to the/)).closest('.auth-legal');
    expect(within(form).getByRole('link', { name: 'Terms of Service' }).getAttribute('target')).toBe('_blank');

    await user.click(footer.getByRole('link', { name: 'Terms of Service' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/terms'));
  });

  it('can be read before choosing a username: the required dialog does not cover them', async () => {
    signIn({ prof: profile({ username: 'user_ab12cd34', username_confirmed_at: null }) });
    renderAt('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy();
    await waitFor(() => expect(repo.fetchProfile).toHaveBeenCalled());
    expect(screen.queryByText('Choose your username')).toBeNull();
  });
});
