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

export async function createGroup(group, userId) {
  check(await supabase.from('groups').insert({
    id: group.id, name: group.name.trim(), currency_code: group.currencyCode, created_by: userId,
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
// functions in 2026103101_username_invitations.sql. A rule that is not met comes back as { error }.
const orError = (result) => {
  if (result?.error) throw new Error(result.error);
  return result;
};

/** Owner: invites the account with this @username to become `personId` in the group. */
export async function inviteByUsername(groupId, personId, username) {
  return orError(check(await supabase.rpc('invite_by_username', {
    target_group_id: groupId, target_person_id: personId, invitee_username: username,
  })));
}

/** Owner: the group's invitations, pending first. */
export async function listGroupInvitations(groupId) {
  return check(await supabase.rpc('list_group_invitations', { target_group_id: groupId })) || [];
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

export async function removeMember(groupId, userId) {
  check(await supabase.rpc('remove_member', { target_group_id: groupId, member_id: userId }));
}

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
 */
export function subscribeToChanges({ onGroupChanged, onGroupDeleted }) {
  const channel = supabase
    .channel('expense-splitter-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
      if (payload.new?.group_id) onGroupChanged(payload.new.group_id);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'groups' }, (payload) => {
      if (payload.old?.id) onGroupDeleted(payload.old.id);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
