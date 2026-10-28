// @vitest-environment jsdom
// The activity bell: signed-in only, an unread dot kept on this device, live updates through the workspace's one
// channel without duplicates, only groups the user can open, and keyboard use. The real App, router and workspace,
// with the session and Supabase data layer mocked (who may read which activity is enforced by Row Level Security).
import React from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  act, cleanup, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';
import * as repo from './data/cloudRepo';

const mocks = vi.hoisted(() => ({ auth: {} }));

vi.mock('./supabase', () => ({
  supabase: null, supabaseConfigured: true, normalizeSupabaseUrl: () => '', supabaseUrl: '',
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
}));

const ME = 'user-me';
const FRIEND = 'user-friend';
const SEEN_KEY = 'expenseSplitterActivitySeenV1';
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
let realtime;
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
  realtime = null;
  repo.subscribeToChanges.mockImplementation((handlers) => { realtime = handlers; return () => {}; });
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
const bell = () => screen.findByRole('button', { name: /^Notifications/ });
// Finds the bell once, then polls only its label. Re-running a page-wide role query inside waitFor keeps a slow
// machine too busy to deliver the very data being waited for.
const bellLabelBecomes = async (label) => {
  await bell();
  await waitFor(() => expect(document.querySelector('.activity-bell button').getAttribute('aria-label')).toBe(label));
};
const panel = () => document.querySelector('.activity-drawer .ant-drawer-section') || null;
const openPanel = async (user) => {
  await user.click(await bell());
  await waitFor(() => expect(panel()).toBeTruthy());
  return panel();
};
const shownTexts = (root) => Array.from(root.querySelectorAll('.activity-entry-text')).map((node) => node.textContent);
const live = (row) => act(() => { realtime.onGroupChanged(row.group_id, row); });
const seenStored = () => JSON.parse(store.get(SEEN_KEY) || '{}')[ME];

describe('activity bell: who sees it', () => {
  it('replaces the green signed-in dot with a bell for signed-in users', async () => {
    signIn();
    renderAt();
    expect(await bell()).toBeTruthy();
    await waitFor(() => expect(repo.fetchActivity).toHaveBeenCalledWith(30));
    expect(screen.getByRole('link', { name: 'Account' }).querySelector('.ant-badge-dot')).toBeNull();
  });

  it('guests never see the bell or load any activity', async () => {
    mocks.auth = {
      user: null, ready: true, recovering: false, signOut: () => Promise.resolve(), updateDisplayName: () => Promise.resolve(),
    };
    renderAt();
    await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    expect(repo.fetchActivity).not.toHaveBeenCalled();
    expect(repo.subscribeToChanges).not.toHaveBeenCalled();
  });
});

describe('activity bell: unread dot (this device only)', () => {
  it("shows no dot for what was already there, then a dot when someone else's activity arrives live", async () => {
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(2), entry(1)]);
    renderAt();
    await waitFor(() => expect(seenStored()).toBe(2)); // first use on this device: the history counts as seen
    expect((await bell()).getAttribute('aria-label')).toBe('Notifications');

    live(entry(3, { actor: ME, actorName: 'Me' })); // your own change is not "new" to you
    expect((await bell()).getAttribute('aria-label')).toBe('Notifications');

    live(entry(4));
    await bellLabelBecomes('Notifications (1 new update in your groups)');
    expect(document.querySelector('.activity-bell [role="status"]').textContent).toBe('1 new update in your groups');
    expect(document.querySelector('.activity-bell .ant-badge-count').textContent).toBe('1');
  });

  it('opening the panel clears the dot and remembers that on this device, without writing to the server', async () => {
    const user = userEvent.setup();
    signIn();
    store.set(SEEN_KEY, JSON.stringify({ [ME]: 1, 'someone-else': 99 }));
    repo.fetchActivity.mockResolvedValue([entry(3), entry(2), entry(1)]);
    renderAt();
    await bellLabelBecomes('Notifications (2 new updates in your groups)');

    const opened = await openPanel(user);
    await waitFor(() => expect(seenStored()).toBe(3));
    expect(JSON.parse(store.get(SEEN_KEY))['someone-else']).toBe(99);
    expect((await bell()).getAttribute('aria-label')).toBe('Notifications');
    // The rows that were new when the panel opened are marked for sighted and screen-reader users.
    expect(within(opened).getAllByText('New:')).toHaveLength(2);
    expect(repo.saveProfile).not.toHaveBeenCalled();

    cleanup();
    renderAt(); // a reload on this device: still seen
    await waitFor(() => expect(repo.fetchActivity).toHaveBeenCalledTimes(3));
    expect((await bell()).getAttribute('aria-label')).toBe('Notifications');
  });

  it('keeps working when this browser blocks storage', async () => {
    signIn();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    repo.fetchActivity.mockResolvedValue([entry(1)]);
    renderAt();
    expect((await bell()).getAttribute('aria-label')).toBe('Notifications');
    await waitFor(() => expect(realtime).toBeTruthy());
    live(entry(2));
    await bellLabelBecomes('Notifications (1 new update in your groups)');
  });
});

describe('activity panel: content', () => {
  it('lists recent activity newest first, with the group and who did it ("You" for yourself)', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(2), entry(5, { groupId: FLAT.id }), entry(3, { actor: ME, actorName: 'Me' })]);
    renderAt();
    const opened = await openPanel(user);
    await waitFor(() => expect(shownTexts(opened)).toHaveLength(3));
    expect(shownTexts(opened)).toEqual([
      'Priya added “Dinner 5” · ₹50.00, paid by Asha',
      'You added “Dinner 3” · ₹30.00, paid by Asha',
      'Priya added “Dinner 2” · ₹20.00, paid by Asha',
    ]);
    expect(opened.querySelector('.activity-entry-meta').textContent).toMatch(/^Flat · /);
    expect(within(opened).getByRole('list', { name: 'Recent activity, newest first' })).toBeTruthy();
    expect(opened.textContent).not.toMatch(/example\.com|user-friend|user-me/);
  });

  it('explains when there is no recent activity', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt();
    const opened = await openPanel(user);
    expect(await within(opened).findByText(/No recent activity in your groups/)).toBeTruthy();
  });

  it('shows a clear loading state while the first load runs', async () => {
    const user = userEvent.setup();
    signIn();
    let finish;
    repo.fetchActivity.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderAt();
    const opened = await openPanel(user);
    expect(within(opened).getByRole('status').textContent).toBe('Loading activity…');
    await act(async () => { finish([entry(1)]); });
    await waitFor(() => expect(shownTexts(opened)).toHaveLength(1));
    expect(within(opened).queryByText('Loading activity…')).toBeNull();
  });

  it('only shows groups the user can open now, and drops a group as soon as access is lost', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(3, { groupId: 'g-not-mine' }), entry(2, { groupId: FLAT.id }), entry(1)]);
    renderAt();
    const opened = await openPanel(user);
    await waitFor(() => expect(shownTexts(opened)).toHaveLength(2));
    expect(opened.textContent).not.toMatch(/Dinner 3/);

    act(() => { realtime.onGroupDeleted(FLAT.id); });
    await waitFor(() => expect(shownTexts(opened)).toEqual(['Priya added “Dinner 1” · ₹10.00, paid by Asha']));
  });
});

describe('activity panel: live updates', () => {
  it('adds live activity while open, once, even when the channel and a reload deliver the same row', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(1)]);
    renderAt();
    const opened = await openPanel(user);
    await waitFor(() => expect(realtime).toBeTruthy());
    act(() => { realtime.onStatus('live'); });
    expect(within(opened).getByText(/Live: new activity appears here/)).toBeTruthy();

    live(entry(2));
    live(entry(2));
    await waitFor(() => expect(shownTexts(opened)).toHaveLength(2));
    expect(shownTexts(opened)[0]).toMatch(/Dinner 2/);
    // Seen while open: no dot appears for it.
    expect((await bell()).getAttribute('aria-label')).toBe('Notifications');

    // The channel drops and comes back: the log is re-read, and rows already shown are not repeated.
    repo.fetchActivity.mockResolvedValue([entry(3), entry(2), entry(1)]);
    act(() => { realtime.onStatus('offline'); });
    expect(within(opened).getByText('Live updates are unavailable right now. Showing recent history.')).toBeTruthy();
    const loads = repo.fetchActivity.mock.calls.length;
    act(() => { realtime.onStatus('live'); });
    await waitFor(() => expect(repo.fetchActivity).toHaveBeenCalledTimes(loads + 1));
    await waitFor(() => expect(shownTexts(opened)).toHaveLength(3));
    expect(shownTexts(opened).map((text) => text.match(/Dinner \d/)[0])).toEqual(['Dinner 3', 'Dinner 2', 'Dinner 1']);
  });

  it('never claims live updates before the channel is connected', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt();
    const opened = await openPanel(user);
    expect(within(opened).getByText('Connecting to live updates… Showing recent history.')).toBeTruthy();
    expect(within(opened).queryByText(/Live: new activity/)).toBeNull();
  });

  it('shows an error with Retry when the activity cannot be loaded', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockRejectedValue(new Error('Failed to fetch'));
    renderAt();
    const opened = await openPanel(user);
    const alert = await within(opened).findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load activity/);
    expect(within(opened).queryByText(/No recent activity/)).toBeNull();

    repo.fetchActivity.mockResolvedValue([entry(1)]);
    await user.click(within(opened).getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(shownTexts(opened)).toHaveLength(1));
    expect(within(opened).queryByRole('alert')).toBeNull();
  });

  it('uses the one existing channel for groups and the bell, and stops listening on sign-out', async () => {
    signIn();
    const stop = vi.fn();
    repo.subscribeToChanges.mockImplementation((handlers) => { realtime = handlers; return stop; });
    const view = renderAt();
    await bell();
    await waitFor(() => expect(repo.subscribeToChanges).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('activity panel: navigation and keyboard', () => {
  it('opens the related group and closes the panel', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(1, { groupId: GOA.id })]);
    renderAt();
    const opened = await openPanel(user);
    await user.click(await within(opened).findByRole('button', { name: /Dinner 1/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/groups/goa-trip'));
    await waitFor(() => expect(document.querySelector('.activity-drawer .ant-drawer-section')).toBeNull());
  });

  it('opens with the keyboard, moves focus into the panel, closes with Escape and returns focus to the bell', async () => {
    const user = userEvent.setup();
    signIn();
    repo.fetchActivity.mockResolvedValue([entry(1)]);
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
    // Every entry is a real button, so Tab and Enter reach it.
    expect(within(panel()).getAllByRole('button', { name: /Dinner 1/ })[0].tagName).toBe('BUTTON');

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
