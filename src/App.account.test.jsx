// @vitest-environment jsdom
// Signed-in account screens: the real App, router and workspace, with the session and the Supabase data layer mocked.
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

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: 'user-1', email: 'asha@example.com', email_confirmed_at: '2026-10-01T00:00:00Z', user_metadata: {},
    },
    ready: true,
    recovering: false,
    signOut: () => Promise.resolve(),
    updateDisplayName: () => Promise.resolve(),
  },
}));

vi.mock('./supabase', () => ({ supabase: null, supabaseConfigured: true, normalizeSupabaseUrl: () => '' }));
vi.mock('./state/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./data/cloudRepo', () => ({
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  subscribeToChanges: vi.fn(),
  importGroup: vi.fn(),
  checkUsername: vi.fn(),
  suggestUsername: vi.fn(),
  setUsername: vi.fn(),
}));

const confirmed = {
  id: 'user-1', display_name: 'Asha Rao', username: 'asha_rao', username_confirmed_at: '2026-10-01T00:00:00Z',
  username_changed_at: null, saved_people: [], currency_code: 'INR', preferences: {},
};
const provisional = { ...confirmed, username: 'user_ab12cd34', username_confirmed_at: null };

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
  repo.fetchGroups.mockResolvedValue([]);
  repo.fetchProfile.mockResolvedValue(confirmed);
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.checkUsername.mockResolvedValue('available');
  repo.suggestUsername.mockResolvedValue('asharao');
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Location() {
  const { pathname, hash } = useLocation();
  return <output data-testid="location">{pathname + hash}</output>;
}

// antd gives every element the id "test-id" under test, so a dialog's accessible name is unreliable here:
// find dialogs by the title they show instead.
const dialogTitled = (title) => screen.queryAllByRole('dialog').find((dialog) => within(dialog).queryByText(title)) || null;
const findDialog = async (title) => {
  await waitFor(() => expect(dialogTitled(title)).toBeTruthy());
  return dialogTitled(title);
};

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /><Location /></AppProvider>
  </MemoryRouter>,
);

describe('Settings when signed in', () => {
  it('shows the account first: name, @username, email (to its owner), status and sign-out', async () => {
    renderAt('/settings');
    const account = await screen.findByRole('heading', { level: 2, name: 'Asha Rao' });
    const section = account.closest('.account-card');
    expect(section.parentElement.firstElementChild).toBe(section); // first in the panel
    const scope = within(section);
    expect(scope.getAllByText('@asha_rao').length).toBeGreaterThan(0);
    expect(scope.getByText('asha@example.com')).toBeTruthy();
    expect(scope.getByText('Signed in')).toBeTruthy();
    expect(scope.getByText('Email verified')).toBeTruthy();
    expect(scope.getByRole('button', { name: /sign out/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in or create account' })).toBeNull();
    expect(screen.queryByText('Choose your username')).toBeNull();
  });

  it('saves a new display name without touching the username', async () => {
    const user = userEvent.setup();
    repo.saveProfile.mockResolvedValue();
    renderAt('/settings');
    const field = await screen.findByLabelText(/display name/i);
    await user.clear(field);
    await user.type(field, 'Asha R');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(repo.saveProfile).toHaveBeenCalledWith('user-1', { display_name: 'Asha R' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Asha R' })).toBeTruthy();
  });

  it('changes the username from Settings, and shows when it can next change', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue({ ...confirmed, username_changed_at: new Date().toISOString() });
    repo.setUsername.mockResolvedValue({ username: 'asha_r', username_confirmed_at: confirmed.username_confirmed_at });
    renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: 'Change' }));
    const dialog = await findDialog('Change your username');
    expect(within(dialog).getByText(/You can choose a new username again on/)).toBeTruthy();
    const field = within(dialog).getByLabelText('Username');
    expect(field.value).toBe('asha_rao');
    await user.clear(field);
    await user.type(field, '@Asha_R');
    await user.click(within(dialog).getByRole('button', { name: 'Save username' }));
    await waitFor(() => expect(repo.setUsername).toHaveBeenCalledWith('asha_r'));
    await waitFor(() => expect(dialogTitled('Change your username')).toBeNull());
    expect(screen.getAllByText('@asha_r').length).toBeGreaterThan(0);
  });

  it('shows the server’s reason when a username is refused', async () => {
    const user = userEvent.setup();
    repo.setUsername.mockRejectedValue(new Error('That username is taken'));
    renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: 'Change' }));
    const dialog = await findDialog('Change your username');
    const field = within(dialog).getByLabelText('Username');
    await user.clear(field);
    await user.type(field, 'ben_k');
    await user.click(within(dialog).getByRole('button', { name: 'Save username' }));
    expect(await within(dialog).findByText('That username is taken')).toBeTruthy();
  });
});

describe('/profile when signed in', () => {
  it('redirects to the account section in Settings', async () => {
    renderAt('/profile');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/settings#account');
    expect(screen.queryByRole('heading', { level: 1, name: 'Your account' })).toBeNull();
  });
});

describe('required username dialog', () => {
  it('asks an account with a provisional name to choose one, suggesting an available handle', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue(provisional);
    repo.setUsername.mockResolvedValue({ username: 'asharao', username_confirmed_at: '2026-10-28T00:00:00Z' });
    renderAt('/settings');
    const dialog = await findDialog('Choose your username');
    const field = within(dialog).getByLabelText('Username');
    await waitFor(() => expect(field.value).toBe('asharao'));
    expect(await within(dialog).findByText('@asharao is available')).toBeTruthy();

    // It cannot be dismissed: no close button, Escape does nothing. Signing out is the only other way out.
    expect(document.querySelector('.ant-modal-close')).toBeNull();
    await user.keyboard('{Escape}');
    expect(dialogTitled('Choose your username')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeTruthy();

    await user.clear(field);
    await user.type(field, 'user_me');
    expect(await within(dialog).findByText('That username is reserved')).toBeTruthy();
    await user.clear(field);
    await user.type(field, 'ab');
    expect(await within(dialog).findByText(/3–20 characters/)).toBeTruthy();
    expect(repo.setUsername).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, 'asharao');
    await user.click(within(dialog).getByRole('button', { name: 'Save username' }));
    await waitFor(() => expect(repo.setUsername).toHaveBeenCalledWith('asharao'));
    await waitFor(() => expect(dialogTitled('Choose your username')).toBeNull());
  });

  it('comes before the offer to move this device’s guest groups into the account', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STATE_KEY, JSON.stringify({ groups: [{ ...newGroup('Made offline'), people: ['Zed'] }] }));
    repo.fetchProfile.mockResolvedValue(provisional);
    repo.setUsername.mockResolvedValue({ username: 'asharao', username_confirmed_at: '2026-10-28T00:00:00Z' });
    renderAt('/settings');
    const dialog = await findDialog('Choose your username');
    expect(dialogTitled('Keep the groups from this device?')).toBeNull();
    await waitFor(() => expect(within(dialog).getByLabelText('Username').value).toBe('asharao'));
    await user.click(within(dialog).getByRole('button', { name: 'Save username' }));
    expect(await findDialog('Keep the groups from this device?')).toBeTruthy();
  });

  it('waits while a password-reset link is being completed', async () => {
    repo.fetchProfile.mockResolvedValue(provisional);
    mocks.auth.recovering = true;
    try {
      renderAt('/settings');
      expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeTruthy();
      expect(screen.getByTestId('location').textContent).toBe('/reset-password');
      await expect(findDialog('Choose your username')).rejects.toThrow();
    } finally {
      mocks.auth.recovering = false;
    }
  });

  it('is not shown before the database has usernames (profile without the column)', async () => {
    const { username: _u, username_confirmed_at: _c, username_changed_at: _d, ...legacy } = confirmed;
    repo.fetchProfile.mockResolvedValue(legacy);
    renderAt('/settings');
    expect(await screen.findByRole('heading', { level: 2, name: 'Asha Rao' })).toBeTruthy();
    expect(dialogTitled('Choose your username')).toBeNull();
  });
});
