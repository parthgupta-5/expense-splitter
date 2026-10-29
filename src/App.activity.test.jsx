// @vitest-environment jsdom
// The bell and the Recent activities page. The bell is signed-in only and holds just what waits for an answer (group
// invitations and friend requests); what happened in the groups is on the Recent activities page. The real App, router
// and workspace, with the session and Supabase data layer mocked (who may read which activity is enforced by Row Level
// Security).
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
import { preloadLazyModules } from './test/app';
import * as repo from './data/cloudRepo';

const mocks = vi.hoisted(() => ({ auth: {} }));

vi.mock('./supabase', () => ({
  supabase: null, supabaseConfigured: true, normalizeSupabaseUrl: () => '', supabaseUrl: '',
}));
vi.mock('./state/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./data/cloudRepo', () => ({
  listFriends: vi.fn(() => Promise.resolve([])),
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  subscribeToChanges: vi.fn(),
  fetchActivity: vi.fn(),
  importGroup: vi.fn(),
  listMyInvitations: vi.fn(),
  listGroupPeople: vi.fn(),
}));

const ME = 'user-me';
const FRIEND = 'user-friend';
const group = (id, name) => ({
  id,
  name,
  currencyCode: 'INR',
  people: ['Asha', 'Ben'],
  personRecords: [],
  expenses: [],
  payments: [],
  savedSplits: [],
  createdAt: '2026-10-01T00:00:00Z',
  ownerId: ME,
  role: 'owner',
  memberCount: 2,
  cloud: true,
});
const GOA = group('g-goa', 'Goa trip');
const FLAT = group('g-flat', 'Flat');
const entry = (id, {
  groupId = GOA.id, actor = FRIEND, actorName = 'Priya', description = 'Dinner ' + id,
} = {}) => ({
  id,
  group_id: groupId,
  actor_id: actor,
  actor_name: actorName,
  action: 'expense_added',
  details: { description, amount_cents: 1000 * id, payer: 'Asha' },
  created_at: new Date(Date.UTC(2026, 9, 20, 10, id)).toISOString(),
});

let store;
const signIn = (groups = [GOA, FLAT]) => {
  mocks.auth = {
    user: { id: ME, email: 'me@example.com', user_metadata: {} },
    ready: true,
    recovering: false,
    signOut: () => Promise.resolve(),
    updateDisplayName: () => Promise.resolve(),
  };
  repo.fetchGroups.mockResolvedValue(groups);
  repo.fetchProfile.mockResolvedValue({
    id: ME, display_name: 'Me', username: 'me_one', username_confirmed_at: '2026-10-01', saved_people: [], preferences: {},
  });
};

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
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.fetchGroup.mockImplementation((id) => Promise.resolve([GOA, FLAT].find((item) => item.id === id) || null));
  repo.fetchActivity.mockResolvedValue([]);
  repo.listMyInvitations.mockResolvedValue([]);
  repo.listGroupPeople.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
const renderAt = (path = '/groups') => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /><Location /></AppProvider>
  </MemoryRouter>,
);
// The bell's button, once shown; its accessible name always starts with "Notifications".
const bell = async () => {
  await waitFor(() => expect(document.querySelector('.activity-bell button')?.getAttribute('aria-label')).toMatch(/^Notifications/));
  return document.querySelector('.activity-bell button');
};
const panel = () => document.querySelector('.activity-drawer .ant-drawer-section') || null;
const openPanel = async (user) => {
  await user.click(await bell());
  await waitFor(() => expect(panel()).toBeTruthy());
  return panel();
};

describe('activity bell: who sees it', () => {
  it('replaces the green signed-in dot with a bell for signed-in users', async () => {
    signIn();
    renderAt();
    expect(await bell()).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Account' }).querySelector('.ant-badge-dot')).toBeNull();
  });

  it('guests never see the bell or load any activity', async () => {
    mocks.auth = {
      user: null, ready: true, recovering: false, signOut: () => Promise.resolve(), updateDisplayName: () => Promise.resolve(),
    };
    renderAt();
    expect((await screen.findByText('Sign in')).closest('a').getAttribute('aria-label')).toBe('Sign in');
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    expect(repo.fetchActivity).not.toHaveBeenCalled();
    expect(repo.subscribeToChanges).not.toHaveBeenCalled();
  });
});

describe('the bell holds no activity', () => {
  it('lists no group activity, loads none, and links to Recent activities', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(1)]);
    renderAt();
    const opened = await openPanel(user);
    expect(within(opened).queryByText(/Dinner 1/)).toBeNull();
    expect(repo.fetchActivity).not.toHaveBeenCalled();
    await user.click(within(opened).getByText('See recent activities in your groups'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/activity'));
  });

  it('opens with the keyboard, moves focus into the panel, closes with Escape and returns focus to the bell', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt();
    const button = await bell();
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(panel()).toBeTruthy());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel().getAttribute('role')).toBe('dialog');
    await waitFor(() => expect(panel().contains(document.activeElement)).toBe(true));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('false'));
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('fits a phone screen: the panel is never wider than the viewport', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt();
    await openPanel(user);
    const wrapper = document.querySelector('.activity-drawer .ant-drawer-content-wrapper');
    expect(wrapper.style.maxWidth).toBe('100vw');
  });
});

describe('Recent activities page', () => {
  it('is in the menu, shows the groups\' activity, and old /history links still land there', async () => {
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(2, { groupId: FLAT.id }), entry(1)]);
    renderAt('/history');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/activity'));
    expect(await screen.findByText('Recent activities', { selector: 'h1' })).toBeTruthy();
    expect(await screen.findByText(/Dinner 2/)).toBeTruthy();
    expect(screen.getByText(/Dinner 1/)).toBeTruthy();
    expect(screen.getByText('Recent Activities').closest('a').getAttribute('aria-current')).toBe('page');
  });
});
