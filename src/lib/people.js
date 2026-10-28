import { PERSON_NAME_MAX } from './limits';

const key = (name) => name.trim().toLowerCase();

/**
 * Parses comma-separated names. Returns the valid new names plus the ones rejected
 * (duplicates of existing/earlier names, or longer than the limit).
 */
export function parseNames(raw, existing = [], max = PERSON_NAME_MAX) {
  const seen = new Set(existing.map(key));
  const result = { valid: [], duplicates: [], tooLong: [] };
  String(raw || '').split(',').map((name) => name.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach((name) => {
    if (name.length > max) result.tooLong.push(name);
    else if (seen.has(key(name))) result.duplicates.push(name);
    else { seen.add(key(name)); result.valid.push(name); }
  });
  return result;
}

/** Friendly message describing rejected names, or '' when nothing was rejected. */
export function describeRejected({ duplicates, tooLong }, max = PERSON_NAME_MAX) {
  const parts = [];
  if (duplicates.length) parts.push('already in the list: ' + duplicates.join(', '));
  if (tooLong.length) parts.push('longer than ' + max + ' characters: ' + tooLong.join(', '));
  return parts.join('; ');
}

function hasActivity(name, expenses, payments) {
  return expenses.some((e) => e.payer === name || (e.splitCents && name in e.splitCents))
    || payments.some((p) => p.payer === name || p.payee === name);
}

/**
 * 'blocked' (still owes / is owed), 'confirm' (has history but settled), or 'free'.
 * Settled means exactly zero cents, the same rule as the database's guard_person_removal().
 */
export function removalStatus(name, balances, expenses, payments) {
  if ((balances[name]?.balanceCents ?? 0) !== 0) return 'blocked';
  return hasActivity(name, expenses, payments) ? 'confirm' : 'free';
}

/**
 * The name an account appears under when it becomes a person in a group: its display name (spaces tidied, at most
 * PERSON_NAME_MAX characters), or its @username without the @. Mirrors public.person_label() in the database, which
 * has the final say (the app shows this straight away, then the stored name).
 */
export function personLabel(profile, max = PERSON_NAME_MAX) {
  const name = String(profile?.display_name || '').trim().replace(/\s+/g, ' ').slice(0, max).trim();
  return name || profile?.username || 'Organizer';
}

const INVITATION_KINDS = new Set(['pending', 'declined', 'expired', 'revoked']);

/**
 * One entry per person for the people list, in the group's order. `statuses` are list_group_people() rows (signed-in
 * groups only; the owner also gets invitation details). `kind` is:
 * 'local' (a guest-mode group: everyone is just a name) | 'you' | 'member' | 'pending' | 'declined' | 'expired' |
 * 'revoked' | 'guest'.
 */
export function describePeople({
  people, records = [], statuses = [], userId = null, cloud = false,
}) {
  const statusOf = new Map(statuses.map((row) => [row.name, row]));
  const recordOf = new Map(records.map((record) => [record.name, record]));
  return people.map((name) => {
    const status = statusOf.get(name);
    const record = recordOf.get(name);
    const linkedTo = status ? status.user_id : record?.userId ?? null;
    let kind = 'guest';
    if (!cloud) kind = 'local';
    else if (linkedTo && linkedTo === userId) kind = 'you';
    else if (linkedTo) kind = 'member';
    else if (INVITATION_KINDS.has(status?.invitation_status)) kind = status.invitation_status;
    return {
      name,
      id: status?.person_id ?? record?.id ?? null,
      kind,
      role: status?.member_role ?? null,
      username: status?.username ?? null,
      displayName: status?.display_name ?? '',
      avatarUrl: status?.avatar_url ?? null,
      invitation: status?.invitation_status ? {
        id: status.invitation_id ?? null,
        status: status.invitation_status,
        username: status.invitee_username ?? null,
        name: status.invitee_name ?? '',
        expiresAt: status.expires_at ?? null,
        respondedAt: status.responded_at ?? null,
      } : null,
    };
  });
}

/**
 * What to tell the owner about a find_invitee() result, and whether they can go ahead. `linking`: inviting the
 * account to become an existing guest (invite_by_username) instead of adding a new person.
 */
export function inviteeOutcome(result, { linking = false, rules = 'Check the username' } = {}) {
  const handle = result?.username ? '@' + result.username : 'That account';
  const as = result?.person_name;
  switch (result?.status) {
    case 'available':
      return {
        canAdd: true,
        text: linking
          ? `${handle} will be invited to join as this person. You can keep including them in expenses meanwhile.`
          : `They will appear as ${as}. You can include them in expenses straight away; they can open the group once they accept the invitation.`,
      };
    case 'invited_before':
      return linking
        ? { canAdd: true, text: `${handle} will be invited to join as this person.` }
        : { canAdd: false, text: `${handle} was invited before as ${as} (${result.last_status}). Use Resend on ${as} in the people list.` };
    case 'self':
      return { canAdd: false, text: as ? `That is you. You are already in this group as ${as}.` : 'That is you. Use “Add yourself” in the people list.' };
    case 'member': return { canAdd: false, text: `${handle} is already in this group as ${as}.` };
    case 'pending': return { canAdd: false, text: `${handle} already has a pending invitation (as ${as}).` };
    case 'cooldown': return { canAdd: false, text: `${handle} declined recently. You can invite them again on ${result.retry_on}.` };
    case 'not_found': return { canAdd: false, text: 'No account has that username. Check the spelling, or add them as a guest.' };
    case 'invalid': return { canAdd: false, text: rules };
    default: return { canAdd: false, text: 'Something went wrong. Please try again.' };
  }
}
