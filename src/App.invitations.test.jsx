// @vitest-environment jsdom
// Username invitations in the app: the owner's Share dialog, owner-only group settings, and the invitee's list on the
// Groups page. The real App, router and workspace, with the session and Supabase data layer mocked (the database
// rules themselves are tested in supabase/tests/invitations.test.js).
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
  updateGroup: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
  inviteByUsername: vi.fn(),
  listGroupInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
  listMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

const OWNER = 'owner-1';
const FRIEND = 'friend-1';
const group = (role) => ({
  id: 'g-1',
  name: 'Goa trip',
  currencyCode: 'INR',
  people: ['Asha', 'Ben', 'Chitra'],
  personRecords: [
    { id: 'p-asha', name: 'Asha', userId: null },
    { id: 'p-ben', name: 'Ben', userId: FRIEND },
    { id: 'p-chitra', name: 'Chitra', userId: null },
  ],
  expenses: [],
  payments: [],
  savedSplits: [],
  createdAt: '2026-10-01T00:00:00Z',
  ownerId: OWNER,
  role,
  memberCount: 2,
  cloud: true,
});
const members = [
  { user_id: OWNER, role: 'owner', display_name: 'Owner', username: 'owner_one', person_name: null },
  { user_id: FRIEND, role: 'member', display_name: 'Friend', username: 'friend_one', person_name: 'Ben' },
];
const signIn = (id, groups) => {
  mocks.auth = {
    user: { id, email: id + '@example.com', user_metadata: {} },
    ready: true,
    recovering: false,
    signOut: () => Promise.resolve(),
    updateDisplayName: () => Promise.resolve(),
  };
  repo.fetchGroups.mockResolvedValue(groups);
  repo.fetchProfile.mockResolvedValue({
    id, display_name: id, username: id.replace('-', '_'), username_confirmed_at: '2026-10-01', saved_people: [], preferences: {},
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
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.fetchActivity.mockResolvedValue([]);
  repo.listMembers.mockResolvedValue(members);
  repo.listGroupInvitations.mockResolvedValue([]);
  repo.listMyInvitations.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /><Location /></AppProvider>
  </MemoryRouter>,
);
const dialogTitled = (title) => screen.queryAllByRole('dialog').find((dialog) => within(dialog).queryByText(title)) || null;
const findDialog = async (title) => {
  await waitFor(() => expect(dialogTitled(title)).toBeTruthy());
  return dialogTitled(title);
};
const shownOptions = async () => {
  await screen.findAllByRole('option');
  return Array.from(document.querySelectorAll('.ant-select-item-option')).map((option) => option.getAttribute('title'));
};
async function choose(dialog, label, option) {
  const user = userEvent.setup();
  await user.click(within(dialog).getByLabelText(label));
  const options = await screen.findAllByTitle(option);
  await user.click(options.at(-1));
}

describe('owner: Share dialog', () => {
  it('invites by username for an unlinked person; no email field and no email shown anywhere', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.inviteByUsername.mockResolvedValue({ id: 'i-1', status: 'pending', person_name: 'Chitra', username: 'other_one' });
    renderAt('/groups/goa-trip');
    await user.click(await screen.findByRole('button', { name: /share/i }));
    const dialog = await findDialog('Invite by username');
    await within(dialog).findByText('@owner_one');
    expect(within(dialog).queryByPlaceholderText(/example\.com/)).toBeNull();
    expect(dialog.textContent).not.toMatch(/@example\.com/);
    expect(within(dialog).getByText('@friend_one · is Ben in this group')).toBeTruthy();

    await user.click(within(dialog).getByLabelText(/who they are in this group/i));
    expect(await shownOptions()).toEqual(['Asha', 'Chitra']); // Ben is already linked
    await user.click(screen.getAllByTitle('Chitra').at(-1));
    await user.type(within(dialog).getByLabelText(/their username/i), ' @Other_One ');
    await user.click(within(dialog).getByRole('button', { name: /send invitation/i }));
    await waitFor(() => expect(repo.inviteByUsername).toHaveBeenCalledWith('g-1', 'p-chitra', 'other_one'));
    expect(await screen.findByText('Invitation sent to @other_one to join as Chitra')).toBeTruthy();
  });

  it('shows the database\'s reason on the username field', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.inviteByUsername.mockRejectedValue(new Error('No account has that username'));
    renderAt('/groups/goa-trip');
    await user.click(await screen.findByRole('button', { name: /share/i }));
    const dialog = await findDialog('Invite by username');
    await choose(dialog, /who they are in this group/i, 'Asha');
    await user.type(within(dialog).getByLabelText(/their username/i), 'nobody_here');
    await user.click(within(dialog).getByRole('button', { name: /send invitation/i }));
    expect(await within(dialog).findByText('No account has that username')).toBeTruthy();
  });

  it('lists the group\'s invitations and revokes a pending one after confirmation', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.listGroupInvitations.mockResolvedValue([
      { id: 'i-1', person_id: 'p-chitra', person_name: 'Chitra', invitee_username: 'other_one', status: 'pending', expires_at: '2026-11-30T00:00:00Z' },
      { id: 'i-0', person_id: 'p-asha', person_name: 'Asha', invitee_username: 'old_pal', status: 'declined' },
    ]);
    repo.revokeInvitation.mockResolvedValue({ status: 'revoked' });
    renderAt('/groups/goa-trip');
    await user.click(await screen.findByRole('button', { name: /share/i }));
    const dialog = await findDialog('Invitations');
    expect(await within(dialog).findByText('Pending')).toBeTruthy();
    expect(within(dialog).getByText('Declined')).toBeTruthy();
    // Chitra has a pending invitation, so only Asha can be offered now.
    await user.click(within(dialog).getByLabelText(/who they are in this group/i));
    expect(await shownOptions()).toEqual(['Asha']);
    await user.keyboard('{Escape}');

    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Revoke' }).length).toBe(2)); // the confirmation
    await user.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1));
    await waitFor(() => expect(repo.revokeInvitation).toHaveBeenCalledWith('i-1'));
  });
});

describe('member', () => {
  it('cannot invite, rename the group or change its currency', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, [group('member')]);
    renderAt('/groups/goa-trip');
    await user.click(await screen.findByRole('button', { name: /share/i }));
    const share = await findDialog('Only the owner can invite or remove members.');
    expect(within(share).queryByLabelText(/their username/i)).toBeNull();
    expect(within(share).queryByText('Invite by username')).toBeNull();
    await user.click(within(share).getByRole('button', { name: /close/i }));

    await user.click(screen.getByRole('button', { name: /group settings/i }));
    const settings = await findDialog('Only the group owner can rename the group or change its currency.');
    expect(within(settings).queryByLabelText(/group name/i)).toBeNull();
    expect(within(settings).queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(within(settings).getByRole('button', { name: /leave group/i })).toBeTruthy();
    expect(repo.updateGroup).not.toHaveBeenCalled();
  });
});

describe('invitee: Groups page', () => {
  const pending = {
    id: 'i-1', group_id: 'g-9', group_name: 'Flat rent', person_name: 'Ben', invited_by_name: 'Owner',
    invited_by_username: 'owner_one', status: 'pending', expires_at: '2026-11-30T00:00:00Z',
  };

  it('accepts an invitation, loads the group and opens it', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending, { ...pending, id: 'i-0', group_name: 'Old trip', person_name: 'Asha', status: 'expired' }]);
    repo.acceptInvitation.mockResolvedValue({ group_id: 'g-9', person_name: 'Ben', status: 'accepted' });
    repo.fetchGroup.mockResolvedValue({ ...group('member'), id: 'g-9', name: 'Flat rent' });
    renderAt('/groups');
    const panel = (await screen.findByRole('heading', { level: 2, name: 'Invitations for you (1)' })).closest('.invitations-panel');
    expect(within(panel).getByText('Flat rent')).toBeTruthy();
    expect(within(panel).getByText('· join as Ben')).toBeTruthy();
    expect(within(panel).getAllByText('From Owner (@owner_one)')).toHaveLength(2);
    expect(within(panel).getByText('Expired')).toBeTruthy();
    expect(within(panel).getAllByRole('button', { name: 'Accept' })).toHaveLength(1); // only the pending one

    await user.click(within(panel).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(repo.acceptInvitation).toHaveBeenCalledWith('i-1'));
    expect(repo.fetchGroup).toHaveBeenCalledWith('g-9', FRIEND);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/groups/flat-rent'));
    expect(await screen.findByText('You joined Flat rent as Ben')).toBeTruthy();
  });

  it('declines only after confirmation, explaining the 7-day wait', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValueOnce([pending]).mockResolvedValue([{ ...pending, status: 'declined' }]);
    repo.declineInvitation.mockResolvedValue({ status: 'declined' });
    renderAt('/groups');
    const panel = (await screen.findByRole('heading', { level: 2, name: /Invitations for you/ })).closest('.invitations-panel');
    await user.click(within(panel).getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText(/not be able to invite you as this person again for 7 days/)).toBeTruthy();
    expect(repo.declineInvitation).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Decline' }).at(-1));
    await waitFor(() => expect(repo.declineInvitation).toHaveBeenCalledWith('i-1'));
    expect(await within(panel).findByText('Declined')).toBeTruthy();
    expect(repo.acceptInvitation).not.toHaveBeenCalled();
  });

  it('shows the reason when an invitation can no longer be accepted', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending]);
    repo.acceptInvitation.mockRejectedValue(new Error('This invitation has expired. Ask the owner to invite you again.'));
    renderAt('/groups');
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('This invitation has expired. Ask the owner to invite you again.')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/groups');
  });
});
