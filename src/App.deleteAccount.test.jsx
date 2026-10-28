// @vitest-environment jsdom
// Deleting an account from Settings: what is explained, what blocks it, the typed confirmation, signing in again when
// the last sign-in is too old, and honest failure messages. The real App, router and workspace, with the session and
// the data layer mocked (the server side is tested in supabase/tests/accountDeletion.test.js and
// supabase/tests/deleteAccountFunction.test.js).
import React from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, isInaccessible, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';
import { findHeading, preloadLazyModules } from './test/app';
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
  accountDeletionBlockers: vi.fn(),
  deleteAccount: vi.fn(),
}));

const ME = 'user-1';
const failure = (code, message, groups) => Object.assign(new Error(message), { code, groups });
const flat = {
  id: 'g-flat', name: 'Flat', currencyCode: 'INR', people: ['Asha', 'Ben'], personRecords: [], expenses: [], payments: [],
  savedSplits: [], ownerId: ME, role: 'owner', memberCount: 2, cloud: true,
};
const signIn = ({ providers = ['email'] } = {}) => {
  mocks.auth = {
    user: {
      id: ME, email: 'asha@example.com', user_metadata: {}, app_metadata: { providers }, email_confirmed_at: '2026-10-01',
    },
    ready: true,
    recovering: false,
    signOut: vi.fn(() => Promise.resolve()),
    updateDisplayName: () => Promise.resolve(),
    signIn: vi.fn(() => Promise.resolve()),
    signInWithGoogle: vi.fn(() => Promise.resolve()),
    forgetSession: vi.fn(() => Promise.resolve()),
  };
  repo.fetchGroups.mockResolvedValue([flat]);
  repo.fetchProfile.mockResolvedValue({
    id: ME, display_name: 'Asha', username: 'asha_rao', username_confirmed_at: '2026-10-01', saved_people: [], preferences: {},
  });
};

let store;
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
  store = new Map([['expenseSplitterActivitySeenV1', JSON.stringify({ [ME]: 4, other: 9 })]]);
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key) => (store.has('session:' + key) ? store.get('session:' + key) : null),
    setItem: (key, value) => store.set('session:' + key, String(value)),
    removeItem: (key) => store.delete('session:' + key),
  });
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.fetchActivity.mockResolvedValue([]);
  repo.listMyInvitations.mockResolvedValue([]);
  repo.listGroupPeople.mockResolvedValue([]);
  repo.accountDeletionBlockers.mockResolvedValue([]);
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
const openDialog = async (user) => {
  const area = (await findHeading('Delete account', 2)).closest('.danger-card');
  await user.click(within(area).getByRole('button', { name: /delete account/i }));
  await waitFor(() => expect(screen.queryAllByText('Delete your account?').some((node) => !isInaccessible(node))).toBe(true));
  return screen.getAllByText('Delete your account?').map((node) => node.closest('[role="dialog"]')).find(Boolean);
};
const confirmField = (dialog) => within(dialog).getByLabelText(/type your username/i);
const deleteButton = (dialog) => within(dialog).getByRole('button', { name: /delete my account/i });

describe('delete account: where and what', () => {
  it('sits apart at the end of Settings, for signed-in users only, and explains what happens first', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt('/settings');
    const dialog = await openDialog(user);
    expect(dialog.textContent).toMatch(/This cannot be undone\./);
    expect(dialog.textContent).toMatch(/Groups you own that nobody else uses/);
    expect(dialog.textContent).toMatch(/history shows "Former member"/);
    expect(dialog.textContent).toMatch(/Your @username becomes available to others/);
    expect(repo.accountDeletionBlockers).toHaveBeenCalledTimes(1);
    expect(repo.deleteAccount).not.toHaveBeenCalled();

    cleanup();
    mocks.auth = {
      user: null, ready: true, recovering: false, signOut: () => Promise.resolve(), updateDisplayName: () => Promise.resolve(),
    };
    renderAt('/settings');
    expect(await findHeading('Settings', 1)).toBeTruthy();
    expect(screen.queryByText('Delete account')).toBeNull();
  });
});

describe('delete account: blocked', () => {
  it('names the shared groups to deal with first, links to them, and offers no way to continue', async () => {
    const user = userEvent.setup();
    signIn();
    repo.accountDeletionBlockers.mockResolvedValue([{ group_id: 'g-flat', group_name: 'Flat', member_count: 2 }]);
    renderAt('/settings');
    const dialog = await openDialog(user);
    const blockers = (await within(dialog).findByText('You own groups that other members use')).closest('.delete-blockers');
    expect(within(blockers).getByRole('link', { name: 'Flat' }).getAttribute('href')).toBe('/groups/flat');
    expect(blockers.textContent).toMatch(/Group settings → Delete group/);
    expect(within(dialog).queryByLabelText(/type your username/i)).toBeNull();
    expect(repo.deleteAccount).not.toHaveBeenCalled();
  });

  it('shows the blockers the server reports, even if they appeared after the dialog opened', async () => {
    const user = userEvent.setup();
    signIn();
    repo.deleteAccount.mockRejectedValue(failure('owns_shared_groups', 'You own groups that other members use.', ['Flat']));
    renderAt('/settings');
    const dialog = await openDialog(user);
    await user.type(await waitFor(() => confirmField(dialog)), 'asha_rao');
    await user.click(deleteButton(dialog));
    expect(await within(dialog).findByText('You own groups that other members use')).toBeTruthy();
    expect(mocks.auth.forgetSession).not.toHaveBeenCalled();
  });
});

describe('delete account: confirming', () => {
  it('needs the exact username typed; then deletes, signs out on this device and says so only afterwards', async () => {
    const user = userEvent.setup();
    signIn();
    let finish;
    repo.deleteAccount.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderAt('/settings');
    const dialog = await openDialog(user);
    const field = await waitFor(() => confirmField(dialog));
    await user.type(field, 'asha');
    expect(deleteButton(dialog).disabled).toBe(true);
    await user.clear(field);
    await user.type(field, ' @Asha_Rao ');
    expect(deleteButton(dialog).disabled).toBe(false);
    await user.click(deleteButton(dialog));
    await waitFor(() => expect(repo.deleteAccount).toHaveBeenCalledWith('asha_rao'));
    expect(screen.queryByText('Your account was deleted.')).toBeNull(); // not before the server confirms
    finish({ deleted: true });
    expect(await screen.findByText('Your account was deleted.')).toBeTruthy();
    expect(mocks.auth.forgetSession).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get('expenseSplitterActivitySeenV1'))).toEqual({ other: 9 });
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toBe('/settings'));
  });

  it('asks for the password again when the last sign-in is too old, then finishes the deletion', async () => {
    const user = userEvent.setup();
    signIn();
    repo.deleteAccount
      .mockRejectedValueOnce(failure('reauth_required', 'For your safety, confirm it is you by signing in again, then retry.'))
      .mockResolvedValueOnce({ deleted: true });
    renderAt('/settings');
    const dialog = await openDialog(user);
    await user.type(await waitFor(() => confirmField(dialog)), 'asha_rao');
    await user.click(deleteButton(dialog));
    const password = await within(dialog).findByLabelText('Your password');
    expect(mocks.auth.forgetSession).not.toHaveBeenCalled();
    await user.type(password, 'Correct-Horse-9');
    await user.click(within(dialog).getByRole('button', { name: /confirm and delete/i }));
    await waitFor(() => expect(mocks.auth.signIn).toHaveBeenCalledWith({ email: 'asha@example.com', password: 'Correct-Horse-9' }));
    await waitFor(() => expect(repo.deleteAccount).toHaveBeenCalledTimes(2));
    expect(repo.deleteAccount).toHaveBeenLastCalledWith('asha_rao');
    expect(await screen.findByText('Your account was deleted.')).toBeTruthy();
  });

  it('sends Google-only accounts through Google again, coming back to this section', async () => {
    const user = userEvent.setup();
    signIn({ providers: ['google'] });
    repo.deleteAccount.mockRejectedValue(failure('reauth_required', 'Sign in again.'));
    renderAt('/settings');
    const dialog = await openDialog(user);
    await user.type(await waitFor(() => confirmField(dialog)), 'asha_rao');
    await user.click(deleteButton(dialog));
    await user.click(await within(dialog).findByRole('button', { name: /sign in with google again/i }));
    expect(mocks.auth.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(store.get('session:expense-splitter-auth-return')).toBe('/settings#delete-account');
    expect(within(dialog).queryByLabelText('Your password')).toBeNull();
  });

  it('never claims success when the deletion fails, and keeps the user signed in', async () => {
    const user = userEvent.setup();
    signIn();
    repo.deleteAccount.mockRejectedValue(failure('delete_failed',
      'Your account could not be deleted. Your profile photo was removed; everything else is unchanged. Please try again.'));
    renderAt('/settings');
    const dialog = await openDialog(user);
    await user.type(await waitFor(() => confirmField(dialog)), 'asha_rao');
    await user.click(deleteButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/could not be deleted/);
    expect(screen.queryByText('Your account was deleted.')).toBeNull();
    expect(mocks.auth.forgetSession).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/settings');
  });
});
