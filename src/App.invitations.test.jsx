// @vitest-environment jsdom
// People and invitations in the app: the owner's people list (add by username, which also invites; add guest; resend,
// revoke, keep as guest; add yourself), what members can and cannot do, the invitee's list on the Groups page, and
// invitations in the notification bell. The real App, router and workspace, with the session and Supabase data layer
// mocked (the database rules themselves are tested in supabase/tests/people.test.js and invitations.test.js).
import React from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  act, cleanup, isInaccessible, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';
import * as repo from './data/cloudRepo';
import { buttonIn, findHeading, preloadLazyModules } from './test/app';

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
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  addPeople: vi.fn(),
  removePerson: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
  inviteByUsername: vi.fn(),
  revokeInvitation: vi.fn(),
  listMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  listGroupPeople: vi.fn(),
  findInvitee: vi.fn(),
  addPersonByUsername: vi.fn(),
  keepPersonAsGuest: vi.fn(),
  addMeToGroup: vi.fn(),
}));

const OWNER = 'owner-1';
const FRIEND = 'friend-1';
const SEEN_KEY = 'expenseSplitterInvitationsSeenV1';
const group = (role, { ownerLinked = true } = {}) => ({
  id: 'g-1',
  name: 'Goa trip',
  currencyCode: 'INR',
  people: [...(ownerLinked ? ['Owner'] : []), 'Ben', 'Chitra', 'Dev'],
  personRecords: [
    ...(ownerLinked ? [{ id: 'p-owner', name: 'Owner', userId: OWNER }] : []),
    { id: 'p-ben', name: 'Ben', userId: FRIEND },
    { id: 'p-chitra', name: 'Chitra', userId: null },
    { id: 'p-dev', name: 'Dev', userId: null },
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
const none = {
  invitation_id: null, invitation_status: null, invitee_username: null, invitee_name: null, expires_at: null, responded_at: null,
};
// What list_group_people() returns to the owner (a member gets no invitee details: see the member test).
const ownerStatuses = ({ ownerLinked = true, chitra = 'pending' } = {}) => [
  ...(ownerLinked ? [{
    ...none, person_id: 'p-owner', name: 'Owner', user_id: OWNER, member_role: 'owner', username: 'owner_one', display_name: 'Owner', avatar_url: null,
  }] : []),
  {
    ...none, person_id: 'p-ben', name: 'Ben', user_id: FRIEND, member_role: 'member', username: 'friend_one', display_name: 'Friend', avatar_url: null,
  },
  {
    ...none,
    person_id: 'p-chitra',
    name: 'Chitra',
    user_id: null,
    member_role: null,
    username: null,
    display_name: '',
    avatar_url: null,
    invitation_id: 'i-1',
    invitation_status: chitra,
    invitee_username: 'other_one',
    invitee_name: 'Other',
    expires_at: '2026-11-30T00:00:00Z',
    responded_at: chitra === 'pending' ? null : '2026-10-20T00:00:00Z',
  },
  {
    ...none, person_id: 'p-dev', name: 'Dev', user_id: null, member_role: null, username: null, display_name: '', avatar_url: null,
  },
];
const members = [
  { user_id: OWNER, role: 'owner', display_name: 'Owner', username: 'owner_one', person_name: 'Owner' },
  { user_id: FRIEND, role: 'member', display_name: 'Friend', username: 'friend_one', person_name: 'Ben' },
];
let realtime;
let store;
const signIn = (id, groups, profile = {}) => {
  mocks.auth = {
    user: { id, email: id + '@example.com', user_metadata: {} },
    ready: true,
    recovering: false,
    signOut: () => Promise.resolve(),
    updateDisplayName: () => Promise.resolve(),
  };
  repo.fetchGroups.mockResolvedValue(groups);
  repo.fetchProfile.mockResolvedValue({
    id, display_name: id, username: id.replace('-', '_'), username_confirmed_at: '2026-10-01', saved_people: [], preferences: {}, ...profile,
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
  realtime = null;
  repo.subscribeToChanges.mockImplementation((handlers) => { realtime = handlers; return () => {}; });
  repo.fetchActivity.mockResolvedValue([]);
  repo.fetchGroup.mockImplementation(() => Promise.resolve(group('owner')));
  repo.listMembers.mockResolvedValue(members);
  repo.listMyInvitations.mockResolvedValue([]);
  repo.listGroupPeople.mockResolvedValue(ownerStatuses());
  repo.saveProfile.mockResolvedValue(); // adding a guest also saves them to the profile's saved people
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
// Waits poll cheap text and DOM queries; role queries run once, inside the small part of the page that matters (see
// src/test/app.js for why).
const dialogTitled = (title) => screen.queryAllByText(title)
  .map((node) => node.closest('[role="dialog"]'))
  .find((dialog) => dialog && !isInaccessible(dialog)) || null;
const findDialog = async (title) => {
  await waitFor(() => expect(dialogTitled(title)).toBeTruthy());
  return dialogTitled(title);
};
const peopleList = async () => (await findHeading('Participants', 2)).closest('.people-card');
const rowOf = (card, name) => Array.from(card.querySelectorAll('.person-row'))
  .find((row) => row.querySelector('.person-name strong')?.textContent === name);
const waitForRow = async (name, text) => {
  const card = await peopleList();
  await waitFor(() => expect(rowOf(card, name)?.textContent).toContain(text));
  return rowOf(card, name);
};
const openAddPeople = async (user) => {
  await user.click(within(await peopleList()).getByRole('button', { name: /add people/i }));
  return findDialog('Add by username');
};
// Plain DOM queries inside the dialog (see above): the lookup test runs several rounds.
const find = async (user, dialog, handle) => {
  const input = dialog.querySelector('.find-person-form input');
  await user.clear(input);
  await user.type(input, handle);
  await user.click(dialog.querySelector('.find-person-form button[type="submit"]'));
};
const resultCard = async (dialog) => {
  await waitFor(() => expect(dialog.querySelector('.invitee-card')).toBeTruthy());
  return dialog.querySelector('.invitee-card');
};
const addButton = async (dialog) => {
  await waitFor(() => expect(dialog.querySelector('.invitee-add')).toBeTruthy());
  return dialog.querySelector('.invitee-add');
};

describe('owner: the people list', () => {
  it('shows everyone with what they are: you, a member, an invitation pending, a guest; never an email', async () => {
    signIn(OWNER, [group('owner')]);
    renderAt('/groups/goa-trip');
    expect((await waitForRow('Owner', 'Owner')).textContent).toMatch(/Owner \(you\)Owner@owner_one/);
    expect(rowOf(await peopleList(), 'Ben').textContent).toMatch(/Member.*@friend_one/);
    expect((await waitForRow('Chitra', 'Invitation pending')).textContent).toMatch(/@other_one · expires/);
    expect(rowOf(await peopleList(), 'Dev').textContent).toMatch(/Guest/);
    expect(repo.listGroupPeople).toHaveBeenCalledWith('g-1');
    expect(document.body.textContent).not.toMatch(/@example\.com/);
  });

  it('adds by username in one step: shows only public details, then adds the person and sends the invitation', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.findInvitee.mockResolvedValue({
      status: 'available', username: 'other_two', display_name: 'Priya', avatar_url: null, person_name: 'Priya',
    });
    repo.addPersonByUsername.mockResolvedValue({
      person_id: 'p-priya', person_name: 'Priya', invitation_id: 'i-2', status: 'pending', username: 'other_two', display_name: 'Priya',
    });
    renderAt('/groups/goa-trip');
    const dialog = await openAddPeople(user);
    expect(Array.from(dialog.querySelectorAll('.ant-segmented-item-label'), (node) => node.textContent))
      .toEqual(['Add by username', 'Add guest']);
    await find(user, dialog, ' @Other_Two ');
    await waitFor(() => expect(repo.findInvitee).toHaveBeenCalledWith('g-1', 'other_two'));
    const card = await resultCard(dialog);
    expect(card.getAttribute('role')).toBe('status'); // announced to screen readers
    expect(card.textContent).toMatch(/Priya @other_two/);
    expect(card.textContent).toMatch(/They will appear as Priya\. You can include them in expenses straight away/);
    expect(dialog.textContent).not.toMatch(/@example\.com/);
    const loads = repo.listGroupPeople.mock.calls.length;
    await user.click(await addButton(dialog));
    await waitFor(() => expect(repo.addPersonByUsername).toHaveBeenCalledWith('g-1', 'other_two'));
    expect(await screen.findByText('Priya added. Invitation sent to @other_two.')).toBeTruthy();
    await waitFor(() => expect(repo.fetchGroup).toHaveBeenCalledWith('g-1', OWNER));
    await waitFor(() => expect(repo.listGroupPeople.mock.calls.length).toBeGreaterThan(loads));
    expect(repo.inviteByUsername).not.toHaveBeenCalled();
  });

  const LOOKUPS = [
    [{ status: 'not_found' }, 'No account has that username. Check the spelling, or add them as a guest.'],
    [{ status: 'self', username: 'owner_one', person_name: 'Owner' }, 'That is you. You are already in this group as Owner.'],
    [{ status: 'member', username: 'friend_one', person_name: 'Ben' }, '@friend_one is already in this group as Ben.'],
    [{ status: 'pending', username: 'other_one', person_name: 'Chitra' }, '@other_one already has a pending invitation (as Chitra).'],
    [{ status: 'cooldown', username: 'old_pal', retry_on: '5 Nov 2026' }, '@old_pal declined recently. You can invite them again on 5 Nov 2026.'],
    [{ status: 'invited_before', username: 'old_pal', person_name: 'Pal', last_status: 'expired' }, '@old_pal was invited before as Pal (expired). Use Resend on Pal in the people list.'],
  ];
  const openLookup = async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    renderAt('/groups/goa-trip');
    return { user, dialog: await openAddPeople(user) };
  };

  // Unknown usernames, yourself, people already in the group, pending invitations, a recent decline and an earlier
  // invitation: each is explained, and there is no way to add them.
  it.each(LOOKUPS)('explains a lookup that cannot be added: %j', async (result, message) => {
    const { user, dialog } = await openLookup();
    repo.findInvitee.mockResolvedValueOnce(result);
    await find(user, dialog, 'abc');
    expect((await resultCard(dialog)).textContent).toContain(message);
    expect(dialog.querySelector('.invitee-add')).toBeNull();
  });

  it('explains a malformed username before asking the server, and a rate limit after', async () => {
    const { user, dialog } = await openLookup();
    await find(user, dialog, 'a');
    await waitFor(() => expect(dialog.textContent).toMatch(/Use 3–20 characters/));
    expect(repo.findInvitee).not.toHaveBeenCalled();
    repo.findInvitee.mockRejectedValueOnce(new Error('Too many attempts. Please wait a few minutes and try again.'));
    await find(user, dialog, 'abc');
    await waitFor(() => expect(dialog.textContent).toContain('Too many attempts. Please wait a minute and try again.'));
    expect(dialog.querySelector('.invitee-add')).toBeNull();
  });

  it('shows the database\'s reason when adding fails, and adds nothing', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.findInvitee.mockResolvedValue({ status: 'available', username: 'other_two', display_name: '', person_name: 'other_two' });
    repo.addPersonByUsername.mockRejectedValue(new Error('This group already has 20 pending invitations. Revoke some, or wait for answers.'));
    renderAt('/groups/goa-trip');
    const dialog = await openAddPeople(user);
    await find(user, dialog, 'other_two');
    await user.click(await addButton(dialog));
    await waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent)
      .toBe('This group already has 20 pending invitations. Revoke some, or wait for answers.'));
    expect(repo.addPersonByUsername).toHaveBeenCalledTimes(1);
    expect(dialogTitled('Add by username')).toBeTruthy(); // still open
  });

  it('revokes a pending invitation after confirmation; the person stays in the expenses', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.revokeInvitation.mockResolvedValue({ status: 'revoked' });
    renderAt('/groups/goa-trip');
    const row = await waitForRow('Chitra', 'Invitation pending');
    await user.click(within(row).getByRole('button', { name: 'Revoke' }));
    const confirmation = (await screen.findByText('Revoke the invitation for Chitra?')).closest('.ant-popover');
    expect(confirmation.textContent).toMatch(/@other_one will no longer be able to accept it\. Chitra stays in the expenses\./);
    expect(repo.revokeInvitation).not.toHaveBeenCalled();
    repo.listGroupPeople.mockResolvedValue(ownerStatuses({ chitra: 'revoked' }));
    await user.click(within(confirmation).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(repo.revokeInvitation).toHaveBeenCalledWith('i-1'));
    expect(await screen.findByText('Invitation for Chitra revoked. Chitra stays in the expenses.')).toBeTruthy();
    expect((await waitForRow('Chitra', 'Invitation revoked')).textContent).not.toMatch(/Revoke$/);
  });

  it('after a decline offers Resend, Keep as guest or Remove, never a dead end', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.listGroupPeople.mockResolvedValue(ownerStatuses({ chitra: 'declined' }));
    repo.inviteByUsername.mockResolvedValue({ id: 'i-3', status: 'pending', person_name: 'Chitra', username: 'other_one' });
    repo.keepPersonAsGuest.mockResolvedValue({ status: 'guest' });
    renderAt('/groups/goa-trip');
    const row = await waitForRow('Chitra', 'Declined');
    expect(row.textContent).toMatch(/@other_one declined/);
    expect(within(row).getAllByRole('button').map((button) => button.textContent)).toEqual(['Resend', 'Keep as guest', 'Remove']);

    await user.click(within(row).getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(repo.inviteByUsername).toHaveBeenCalledWith('g-1', 'p-chitra', 'other_one'));
    expect(await screen.findByText('Invitation sent again to @other_one')).toBeTruthy();

    await user.click(within(rowOf(await peopleList(), 'Chitra')).getByRole('button', { name: 'Keep as guest' }));
    await waitFor(() => expect(repo.keepPersonAsGuest).toHaveBeenCalledWith('p-chitra'));
    expect(await screen.findByText('Chitra is now a guest')).toBeTruthy();
  });

  it('adds a guest by name only: no lookup, no invitation', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.addPeople.mockResolvedValue();
    renderAt('/groups/goa-trip');
    const dialog = await openAddPeople(user);
    await user.click(within(dialog).getAllByText('Add guest')[0]);
    expect(within(dialog).getByText(/Guests get no invitation and no emails, and cannot sign in/)).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Guest name'), '  Zed  {Enter}');
    await waitFor(() => expect(repo.addPeople).toHaveBeenCalledWith('g-1', ['Zed']));
    expect(await screen.findByText('Zed added as a guest')).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Guest name'), 'dev{Enter}');
    expect(await screen.findByText('Not added, already in the list: dev')).toBeTruthy();
    expect(repo.findInvitee).not.toHaveBeenCalled();
    expect(repo.addPersonByUsername).not.toHaveBeenCalled();
  });

  it('invites an account to become an existing guest', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.findInvitee.mockResolvedValue({ status: 'available', username: 'dev_r', display_name: 'Dev R', person_name: 'Dev R' });
    repo.inviteByUsername.mockResolvedValue({ id: 'i-4', status: 'pending', person_name: 'Dev', username: 'dev_r' });
    renderAt('/groups/goa-trip');
    const row = await waitForRow('Dev', 'Guest');
    await user.click(within(row).getByRole('button', { name: 'Invite' }));
    const dialog = await findDialog('Invite an account for Dev');
    await find(user, dialog, 'dev_r');
    expect((await addButton(dialog)).textContent).toBe('Send invitation');
    await user.click(await addButton(dialog));
    await waitFor(() => expect(repo.inviteByUsername).toHaveBeenCalledWith('g-1', 'p-dev', 'dev_r'));
    expect(await screen.findByText('Invitation sent to @dev_r to join as Dev')).toBeTruthy();
    expect(repo.addPersonByUsername).not.toHaveBeenCalled();
  });

  it('lets the owner of an older group add or link themselves, and take themselves out again', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner', { ownerLinked: false })], { display_name: 'Owner Person' });
    repo.listGroupPeople.mockResolvedValue(ownerStatuses({ ownerLinked: false }));
    repo.addMeToGroup.mockResolvedValue({ person_id: 'p-dev', person_name: 'Dev' });
    renderAt('/groups/goa-trip');
    const card = await peopleList();
    expect(await within(card).findByText("You are not in this group's expenses yet.")).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: /add yourself/i }));
    const dialog = await findDialog('Add yourself to this group');
    expect(within(dialog).getByText('Add me as Owner Person')).toBeTruthy();
    await user.click(within(dialog).getByText('I am already in the list'));
    await user.click(within(dialog).getByLabelText('Who you are in this group'));
    await user.click((await screen.findAllByTitle('Dev')).at(-1));
    await user.click(within(dialog).getByRole('button', { name: /link me/i }));
    await waitFor(() => expect(repo.addMeToGroup).toHaveBeenCalledWith('g-1', 'p-dev'));
    expect(await screen.findByText('You are in Goa trip as Dev')).toBeTruthy();
  });

  it('removes the owner from the expenses only after a clear confirmation', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [group('owner')]);
    repo.removePerson.mockResolvedValue();
    renderAt('/groups/goa-trip');
    const row = await waitForRow('Owner', '(you)');
    await user.click(within(row).getByRole('button', { name: 'Remove me' }));
    const confirm = await findDialog('Remove yourself from the expenses?');
    expect(confirm.textContent).toMatch(/You stay the owner and keep access/);
    expect(repo.removePerson).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(repo.removePerson).toHaveBeenCalledWith('g-1', 'Owner'));
  });
});

describe('creating a group when signed in', () => {
  it('adds the creator straight away: in the people list, Who paid and Split between', async () => {
    const user = userEvent.setup();
    signIn(OWNER, [], { display_name: '  Asha   Rao ' });
    repo.createGroup.mockResolvedValue({ id: 'new', person_id: 'p-me', person_name: 'Asha Rao' });
    let resolveFetch;
    repo.fetchGroup.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    repo.listGroupPeople.mockResolvedValue([]);
    renderAt('/groups');
    const welcome = (await findHeading('Welcome to Expense Splitter', 2)).closest('.welcome-panel');
    await user.click(buttonIn(welcome, /create your first group/i));
    const dialog = await findDialog('Create a group');
    await user.type(within(dialog).getByLabelText(/group name/i), 'Goa trip');
    await user.click(within(dialog).getByRole('button', { name: /create group/i }));
    await waitFor(() => expect(repo.createGroup).toHaveBeenCalledTimes(1));
    expect(repo.createGroup.mock.calls[0][0]).toMatchObject({ name: 'Goa trip', people: ['Asha Rao'] });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/groups/goa-trip'));
    // Shown before the server's copy arrives.
    const card = await peopleList();
    await waitFor(() => expect(rowOf(card, 'Asha Rao')?.textContent).toMatch(/\(you\)/));
    await user.click(buttonIn(document.querySelector('.group-toolbar'), /add expense/i));
    const form = (await findDialog('Add an expense')).querySelector('#add-expense');
    await user.click(within(form).getByLabelText(/who paid/i));
    expect((await screen.findAllByTitle('Asha Rao')).length).toBeGreaterThan(0);
    // "Split between" starts with everyone, which here is only the creator: it is not empty.
    expect(within(form).getByText('Split between')).toBeTruthy();
    expect(within(form).queryByText('Choose at least one person')).toBeNull();
    await act(async () => resolveFetch(null));
  });
});

describe('member', () => {
  const asMember = () => {
    signIn(FRIEND, [group('member')]);
    repo.listGroupPeople.mockResolvedValue(ownerStatuses().map((row) => ({
      ...row, invitation_id: null, invitee_username: null, invitee_name: null, responded_at: null,
    })));
    renderAt('/groups/goa-trip');
  };

  it('cannot add by username or see who an invitation is for', async () => {
    const user = userEvent.setup();
    asMember();
    const chitra = await waitForRow('Chitra', 'Invitation pending');
    expect(chitra.textContent).not.toMatch(/other_one/);
    expect(within(chitra).queryByRole('button')).toBeNull();
    expect(rowOf(await peopleList(), 'Ben').textContent).toMatch(/\(you\)/);

    const dialog = await openAddPeople(user);
    await user.click(within(dialog).getAllByText('Add by username')[0]);
    expect(within(dialog).getByText('Only the group owner can add people by username. You can still add a guest.')).toBeTruthy();
    expect(within(dialog).queryByLabelText(/their username/i)).toBeNull();
  });

  it('cannot invite or remove members, rename the group or change its currency, and can leave', async () => {
    const user = userEvent.setup();
    asMember();
    const actions = within((await screen.findByText('Members')).closest('.group-header-actions'));
    await user.click(actions.getByRole('button', { name: /members/i }));
    const share = await findDialog('Only the owner can invite or remove members.');
    expect(share.textContent).not.toMatch(/@example\.com/);
    await user.click(within(share).getByRole('button', { name: /close/i }));

    await user.click(actions.getByRole('button', { name: /group settings/i }));
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
    const panel = (await findHeading('Invitations for you (1)', 2)).closest('.invitations-panel');
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
    const panel = (await findHeading('Invitations for you (1)', 2)).closest('.invitations-panel');
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
    const panel = (await findHeading('Invitations for you (1)', 2)).closest('.invitations-panel');
    await user.click(within(panel).getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('This invitation has expired. Ask the owner to invite you again.')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/groups');
  });
});

describe('invitations in the notification bell', () => {
  const pending = {
    id: 'i-1', group_id: 'g-9', group_name: 'Flat rent', person_name: 'Ben', invited_by_name: 'Owner',
    invited_by_username: 'owner_one', status: 'pending', expires_at: '2026-11-30T00:00:00Z',
  };
  const bellButton = () => document.querySelector('.activity-bell button');
  const bellLabelBecomes = async (label) => {
    await waitFor(() => expect(bellButton()?.getAttribute('aria-label')).toBe(label));
  };
  const openBell = async (user) => {
    await user.click(bellButton());
    await waitFor(() => expect(document.querySelector('.activity-drawer .ant-drawer-section')).toBeTruthy());
    return document.querySelector('.activity-drawer .ant-drawer-section');
  };

  it('shows a new invitation with a count; opening the bell clears the count but keeps the invitation pending', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending]);
    renderAt('/history');
    await bellLabelBecomes('Notifications (1 new invitation)');
    expect(document.querySelector('.activity-bell .ant-badge-count').textContent).toBe('1');

    const drawer = await openBell(user);
    const item = (await within(drawer).findByText(/invited you to join/)).closest('.bell-invitation');
    expect(item.textContent).toMatch(/^Owner \(@owner_one\) invited you to join Flat rent\.You would join as Ben/);
    await bellLabelBecomes('Notifications');
    expect(JSON.parse(store.get(SEEN_KEY))[FRIEND]).toEqual(['i-1']);
    expect(repo.acceptInvitation).not.toHaveBeenCalled();
    expect(repo.declineInvitation).not.toHaveBeenCalled();
    expect(within(item).getByRole('button', { name: 'Accept the invitation to Flat rent' })).toBeTruthy();

    cleanup();
    renderAt('/history'); // a reload on this device: still seen, still pending
    await waitFor(() => expect(repo.listMyInvitations.mock.calls.length).toBeGreaterThan(2));
    await bellLabelBecomes('Notifications');
    const again = await openBell(user);
    expect(await within(again).findByText(/invited you to join/)).toBeTruthy();
  });

  it('accepts from the bell: joins, opens the group and closes the panel', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending]);
    repo.acceptInvitation.mockResolvedValue({ group_id: 'g-9', person_name: 'Ben', status: 'accepted' });
    repo.fetchGroup.mockResolvedValue({ ...group('member'), id: 'g-9', name: 'Flat rent' });
    renderAt('/history');
    const drawer = await openBell(user);
    await user.click(await within(drawer).findByRole('button', { name: 'Accept the invitation to Flat rent' }));
    await waitFor(() => expect(repo.acceptInvitation).toHaveBeenCalledWith('i-1'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/groups/flat-rent'));
    expect(await screen.findByText('You joined Flat rent as Ben')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.activity-drawer .ant-drawer-section')).toBeNull());
  });

  it('declines from the bell only after confirmation, then shows no pending invitations', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending]);
    repo.declineInvitation.mockImplementation(() => {
      repo.listMyInvitations.mockResolvedValue([{ ...pending, status: 'declined' }]);
      return Promise.resolve({ status: 'declined' });
    });
    renderAt('/history');
    const drawer = await openBell(user);
    await user.click(await within(drawer).findByRole('button', { name: 'Decline the invitation to Flat rent' }));
    const confirmation = (await screen.findByText('Decline the invitation to Flat rent?')).closest('.ant-popover');
    expect(repo.declineInvitation).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(repo.declineInvitation).toHaveBeenCalledWith('i-1'));
    expect(await within(drawer).findByText('No pending invitations.')).toBeTruthy();
    expect(within(drawer).queryByText(/invited you to join/)).toBeNull();
  });

  it('drops an invitation that was revoked or expired as soon as the live channel says so', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending]);
    renderAt('/history');
    await bellLabelBecomes('Notifications (1 new invitation)');
    const drawer = await openBell(user);
    expect(await within(drawer).findByText(/invited you to join/)).toBeTruthy();
    repo.listMyInvitations.mockResolvedValue([{ ...pending, status: 'revoked' }]);
    await waitFor(() => expect(realtime).toBeTruthy());
    act(() => { realtime.onInvitationsChanged(); });
    expect(await within(drawer).findByText('No pending invitations.')).toBeTruthy();
    await bellLabelBecomes('Notifications');
  });

  it('follows another tab that already opened the bell', async () => {
    signIn(FRIEND, []);
    repo.listMyInvitations.mockResolvedValue([pending]);
    renderAt('/history');
    await bellLabelBecomes('Notifications (1 new invitation)');
    store.set(SEEN_KEY, JSON.stringify({ [FRIEND]: ['i-1'] }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SEEN_KEY })); });
    await bellLabelBecomes('Notifications');
  });

  it('says when there is nothing: no pending invitations and no activity', async () => {
    const user = userEvent.setup();
    signIn(FRIEND, [group('member')]);
    renderAt('/history');
    const drawer = await openBell(user);
    expect(await within(drawer).findByText('You are all caught up. Nothing needs your attention.')).toBeTruthy();
    expect(within(drawer).getByText('No pending invitations.')).toBeTruthy();
    expect(within(drawer).getByText(/No recent activity in your groups/)).toBeTruthy();
  });
});
