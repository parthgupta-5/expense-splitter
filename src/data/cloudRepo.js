// All Supabase data access. Every function throws the Supabase error on failure; callers decide how to report it.
// Authorisation is enforced by Row Level Security and the database functions, not by this file.
import { supabase } from '../supabase';
import { AVATAR_BUCKET, newAvatarPath } from '../lib/avatarUrl';
import {
  expenseToRow, groupToImportPayload, paymentToRow, rowToGroup, snapshotToRow,
} from './mappers';

const GROUP_SELECT = `
  id, name, currency_code, created_by, created_at, updated_at,
  group_people ( id, name, user_id, created_at ),
  expenses ( * ),
  payments ( * ),
  saved_splits ( * ),
  group_members ( user_id, role )
`;

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function fetchGroups(userId) {
  const rows = check(await supabase.from('groups').select(GROUP_SELECT).order('created_at', { ascending: false }));
  return (rows || []).map((row) => rowToGroup(row, userId));
}

/** Resolves to the group, or null when it no longer exists or the user lost access. */
export async function fetchGroup(groupId, userId) {
  const row = check(await supabase.from('groups').select(GROUP_SELECT).eq('id', groupId).maybeSingle());
  return row ? rowToGroup(row, userId) : null;
}

/** Creates the group with the signed-in user as its owner and first person. Resolves to { id, person_id, person_name }. */
export async function createGroup(group) {
  return check(await supabase.rpc('create_group', {
    new_group_id: group.id, new_name: group.name.trim(), new_currency: group.currencyCode,
  }));
}

/** Owner only: the database refuses everyone else, so an update that changed no row is reported as such. */
export async function updateGroup(groupId, { name, currencyCode }) {
  const rows = check(await supabase.from('groups')
    .update({ name: name.trim(), currency_code: currencyCode }).eq('id', groupId).select('id'));
  if (!rows?.length) throw new Error('Only the group owner can rename the group or change its currency.');
}

export async function deleteGroup(groupId) {
  check(await supabase.from('groups').delete().eq('id', groupId));
}

export async function addPeople(groupId, names) {
  check(await supabase.from('group_people').insert(names.map((name) => ({ group_id: groupId, name }))));
}

export async function removePerson(groupId, name) {
  check(await supabase.from('group_people').delete().eq('group_id', groupId).eq('name', name));
}

export async function saveExpense(groupId, expense) {
  check(await supabase.from('expenses').upsert(expenseToRow(expense, groupId)));
}

export async function deleteExpense(expenseId) {
  check(await supabase.from('expenses').delete().eq('id', expenseId));
}

export async function addPayment(groupId, payment) {
  check(await supabase.from('payments').insert(paymentToRow(payment, groupId)));
}

export async function deletePayment(paymentId) {
  check(await supabase.from('payments').delete().eq('id', paymentId));
}

export async function saveSnapshot(groupId, snapshot) {
  check(await supabase.from('saved_splits').insert(snapshotToRow(snapshot, groupId)));
}

export async function deleteSnapshot(snapshotId) {
  check(await supabase.from('saved_splits').delete().eq('id', snapshotId));
}

/** Copies a guest group into the account (one database transaction). Resolves to the new group id. */
export async function importGroup(group) {
  return check(await supabase.rpc('import_group', { payload: groupToImportPayload(group) }));
}

/** Members with their display name, @username and the person they are in the group. No email addresses. */
export async function listMembers(groupId) {
  return check(await supabase.rpc('list_group_members', { target_group_id: groupId })) || [];
}

// Invitations: every rule (owner only, the invitee only, expiry, cooldown, limits) is enforced by the database
// functions in 2026103101_username_invitations.sql and 2026110101_people_invites_account_deletion.sql. A rule that is
// not met comes back as { error }.
const orError = (result) => {
  if (result?.error) throw new Error(result.error);
  return result;
};

/** Owner: invites the account with this @username to become `personId` in the group (linking a guest, or resending). */
export async function inviteByUsername(groupId, personId, username) {
  return orError(check(await supabase.rpc('invite_by_username', {
    target_group_id: groupId, target_person_id: personId, invitee_username: username,
  })));
}

export async function revokeInvitation(invitationId) {
  return orError(check(await supabase.rpc('revoke_invitation', { invitation_id: invitationId })));
}

/** The signed-in user's own invitations, pending first. */
export async function listMyInvitations() {
  return check(await supabase.rpc('list_my_invitations')) || [];
}

/** Resolves to { group_id, person_name }. Safe to retry. */
export async function acceptInvitation(invitationId) {
  return orError(check(await supabase.rpc('accept_invitation', { invitation_id: invitationId })));
}

export async function declineInvitation(invitationId) {
  return orError(check(await supabase.rpc('decline_invitation', { invitation_id: invitationId })));
}

// People and username invitations as one flow (2026110101_people_invites_account_deletion.sql).

/** Every person in the group with their status (member, invitation pending, guest); details only for the owner. */
export async function listGroupPeople(groupId) {
  return check(await supabase.rpc('list_group_people', { target_group_id: groupId })) || [];
}

/** Owner: who this exact @username is (public details only) and where they stand with the group. Rate limited. */
export async function findInvitee(groupId, username) {
  return check(await supabase.rpc('find_invitee', { target_group_id: groupId, invitee_username: username }));
}

/** Owner: adds the account as a new person and sends its invitation, in one step. */
export async function addPersonByUsername(groupId, username) {
  return orError(check(await supabase.rpc('add_person_by_username', {
    target_group_id: groupId, invitee_username: username,
  })));
}

/** Owner: adds themselves to their group as a new person, or links themselves to `personId`. */
export async function addMeToGroup(groupId, personId = null) {
  return orError(check(await supabase.rpc('add_me_to_group', { target_group_id: groupId, target_person_id: personId })));
}

/** Owner: stops inviting this person (revokes a pending invitation, hides answered ones); they stay as a guest. */
export async function keepPersonAsGuest(personId) {
  return orError(check(await supabase.rpc('keep_person_as_guest', { target_person_id: personId })));
}

/** The caller's own groups that other members use; while there are any, the account cannot be deleted. */
export async function accountDeletionBlockers() {
  return check(await supabase.rpc('account_deletion_blockers')) || [];
}

/** An error from the delete-account Edge Function, with its reason code (and the blocking groups, if any). */
export class AccountDeletionError extends Error {
  constructor({ code = 'unknown', message, groups = [] }) {
    super(message || 'Your account could not be deleted. Nothing was changed.');
    this.code = code;
    this.groups = groups;
  }
}

/**
 * Asks the delete-account Edge Function to delete the signed-in account (it checks the session, a recent sign-in and
 * the typed username). The account is disabled at once and deleted for good after 7 days unless it is restored.
 * Resolves to { scheduled: true, deletes_on } once that is done.
 */
export async function deleteAccount(confirm) {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm } });
  if (!error && data?.scheduled) return data;
  let reason = {};
  try { reason = (await error?.context?.json?.()) || {}; } catch { /* not a JSON reply */ }
  if (!reason.code && /failed to send|fetch/i.test(String(error?.message))) {
    reason = { code: 'network', message: "Can't reach the server. Check your connection. Nothing was deleted." };
  }
  throw new AccountDeletionError(reason);
}

/** Takes back an account that is waiting to be deleted (within 7 days of asking). */
export async function restoreAccount() {
  return orError(check(await supabase.rpc('restore_account')));
}

// Friends (2026110201_friends_and_account_recovery.sql). A request becomes a friendship only when it is accepted.

/** Friends and pending requests: { friendship_id, user_id, username, display_name, avatar_url, status, direction }. */
export async function listFriends() {
  return check(await supabase.rpc('list_friends')) || [];
}

/** Sends a friend request to an exact @username (or accepts theirs, if they already asked). */
export async function sendFriendRequest(username) {
  return orError(check(await supabase.rpc('send_friend_request', { friend_username: username })));
}

export async function respondFriendRequest(requestId, accepting) {
  return orError(check(await supabase.rpc('respond_friend_request', { request_id: requestId, accepting })));
}

/** Removes a friend, or cancels a request you sent. */
export async function removeFriend(friendId) {
  return orError(check(await supabase.rpc('remove_friend', { friend_id: friendId })));
}

export async function removeMember(groupId, userId) {
  check(await supabase.rpc('remove_member', { target_group_id: groupId, member_id: userId }));
}

/** The newest activity of every group the user is a member of (Row Level Security hides all other groups). */
export async function fetchActivity(limit = 200) {
  return check(await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit)) || [];
}

export async function fetchProfile(userId) {
  return check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

/** Updates the caller's own profile row (created at sign-up). Username columns cannot be written this way. */
export async function saveProfile(userId, profile) {
  const rows = check(await supabase.from('profiles').update(profile).eq('id', userId).select('id'));
  if (!rows?.length) throw new Error('Your profile was not found. Sign out and sign in again.');
}

/**
 * Uploads an already re-encoded profile photo as a new object in the user's own folder (never overwriting one) and
 * resolves to { path, url }. The Storage policies only accept <user id>/<uuid>.jpg from that signed-in user.
 */
export async function uploadAvatar(userId, blob) {
  const path = newAvatarPath(userId);
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  check(await bucket.upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }));
  return { path, url: bucket.getPublicUrl(path).data.publicUrl };
}

/** Deletes one of the user's own photo objects (a path from ownAvatarPath). */
export async function removeAvatarObject(path) {
  check(await supabase.storage.from(AVATAR_BUCKET).remove([path]));
}

/** 'available' | 'yours' | 'taken' | 'invalid' | 'reserved'. */
export async function checkUsername(name) {
  return check(await supabase.rpc('check_username', { candidate: name }));
}

/** An available username based on the display name, or null. */
export async function suggestUsername() {
  return check(await supabase.rpc('suggest_username'));
}

/** Sets the caller's username. Resolves to { username, username_confirmed_at, username_changed_at }. */
export async function setUsername(name) {
  const result = check(await supabase.rpc('set_username', { new_username: name }));
  if (result?.error) throw new Error(result.error);
  return result;
}

/**
 * Live updates. Every change in a group writes an activity row (database triggers), and Realtime only delivers
 * rows the user may read (RLS), so one subscription covers expenses, payments, people, members and renames.
 * Group deletions arrive separately because the activity log is deleted with the group.
 * onGroupChanged also receives the activity row (for the activity bell); onStatus receives 'live' while the channel is
 * connected and 'offline' when it fails, times out or closes (the client keeps retrying and reports 'live' again).
 * onInvitationsChanged fires when an invitation to this user, or in a group they own, changes. It listens on the same
 * channel to the user's own invitation_updates row, which holds only a timestamp (Row Level Security: own row only).
 */
export function subscribeToChanges({
  userId, onGroupChanged, onGroupDeleted, onInvitationsChanged, onStatus = () => {},
}) {
  let channel = supabase
    .channel('expense-splitter-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
      if (payload.new?.group_id) onGroupChanged(payload.new.group_id, payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'groups' }, (payload) => {
      if (payload.old?.id) onGroupDeleted(payload.old.id);
    });
  if (userId && onInvitationsChanged) {
    const ownRow = { schema: 'public', table: 'invitation_updates', filter: `user_id=eq.${userId}` };
    channel = channel
      .on('postgres_changes', { event: 'INSERT', ...ownRow }, () => onInvitationsChanged())
      .on('postgres_changes', { event: 'UPDATE', ...ownRow }, () => onInvitationsChanged());
  }
  channel.subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'live' : 'offline'));
  return () => { supabase.removeChannel(channel); };
}
