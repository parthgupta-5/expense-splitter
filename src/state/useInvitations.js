import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { groupPath } from '../lib/groupSlug';
import { SEEN_KEYS, readInvitationsSeen, writeInvitationsSeen } from '../lib/storage';

const fresh = (key) => ({
  key, rows: [], loaded: false, error: '', seen: key ? readInvitationsSeen(key) : [],
});

/**
 * The signed-in user's own invitations (list_my_invitations(): pending first, then the last 30 days' answers), shared
 * by the bell and the Groups page so both always agree. Re-read when the workspace's live channel says an invitation
 * changed, after the channel reconnects, and when the tab becomes visible. Which pending invitations the bell has shown
 * is remembered on this device (and followed across tabs); that only clears the bell's count, never the invitation.
 */
export function useInvitations({
  userId, enabled, realtime, onChange,
}) {
  const key = enabled && userId ? userId : null;
  const [state, setState] = useState(() => fresh(key));
  const current = state.key === key ? state : fresh(key);
  const keyRef = useRef(key);
  const currentRef = useRef(current);
  useEffect(() => { keyRef.current = key; currentRef.current = current; });
  const update = useCallback((forKey, change) => setState((previous) => {
    if (forKey !== keyRef.current) return previous; // an answer for an earlier session
    const base = previous.key === forKey ? previous : fresh(forKey);
    return { ...base, ...change(base) };
  }), []);

  const reload = useCallback(() => {
    if (!key) return Promise.resolve();
    return repo.listMyInvitations()
      .then((rows) => update(key, () => ({ rows: rows || [], loaded: true, error: '' })))
      .catch((error) => update(key, () => ({ loaded: true, error: 'Could not load your invitations: ' + friendlyError(error) })));
  }, [key, update]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => (key && onChange ? onChange(() => { reload(); }) : undefined), [key, onChange, reload]);

  const lastRealtime = useRef(realtime);
  useEffect(() => {
    const previous = lastRealtime.current;
    lastRealtime.current = realtime;
    if (realtime === 'live' && previous === 'offline') reload();
  }, [realtime, reload]);

  // Another tab opened the bell: follow it, so the count is the same everywhere on this device.
  useEffect(() => {
    if (!key) return undefined;
    const onStorage = (event) => {
      if (event.key === SEEN_KEYS.invitations) update(key, () => ({ seen: readInvitationsSeen(key) }));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, update]);

  const pending = current.rows.filter((row) => row.status === 'pending');
  const unseen = pending.filter((row) => !current.seen.includes(row.id));

  /** Remembers the pending invitations as seen (this device only). Only ids of still-pending invitations are kept. */
  const markSeen = useCallback(() => {
    const { rows, seen } = currentRef.current;
    const ids = rows.filter((row) => row.status === 'pending').map((row) => row.id);
    if (!key || ids.every((id) => seen.includes(id))) return;
    writeInvitationsSeen(key, ids);
    update(key, () => ({ seen: ids }));
  }, [key, update]);

  return {
    rows: current.rows,
    pending,
    unseen,
    loaded: current.loaded,
    error: current.error,
    reload,
    markSeen,
  };
}

/**
 * Accept or decline one invitation, one at a time. Accepting loads the group and opens it; both re-read the list, so
 * every view of it updates. `onDone` runs after a successful answer (the bell closes itself).
 */
export function useAnswerInvitation({
  invitations, workspace, notify, onDone,
}) {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const working = useRef(false);

  const answer = async (invitation, accepting) => {
    if (working.current) return;
    working.current = true;
    setBusyId(invitation.id);
    try {
      if (accepting) {
        const result = await repo.acceptInvitation(invitation.id);
        const joined = await workspace.actions.refreshGroup(result.group_id)
          || { id: result.group_id, name: invitation.group_name };
        notify.success(`You joined ${invitation.group_name} as ${result.person_name}`);
        onDone?.();
        // workspace.groups is from before the join, so the new group is added here to get its readable address.
        navigate(groupPath(joined, [...workspace.groups.filter((item) => item.id !== joined.id), joined]));
      } else {
        await repo.declineInvitation(invitation.id);
        notify.info(`Invitation to ${invitation.group_name} declined`);
      }
    } catch (failure) {
      notify.error(friendlyError(failure));
    } finally {
      working.current = false;
      setBusyId(null);
      invitations.reload();
    }
  };

  return { answer, busyId };
}
