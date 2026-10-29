import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';

const fresh = (key) => ({
  key, rows: [], loaded: false, error: '',
});

/**
 * The signed-in user's friends and friend requests (list_friends()), shared by the bell, the Friends page and the top
 * bar. Re-read when the workspace's live channel says something changed (friend requests use the same signal as
 * invitations), after the channel reconnects, and after every change made here. Guests have no friends list.
 */
export function useFriends({
  userId, enabled, realtime, onChange,
}) {
  const key = enabled && userId ? userId : null;
  const [state, setState] = useState(() => fresh(key));
  const current = state.key === key ? state : fresh(key);
  const keyRef = useRef(key);
  useEffect(() => { keyRef.current = key; });
  const update = useCallback((forKey, change) => setState((previous) => {
    if (forKey !== keyRef.current) return previous; // an answer for an earlier session
    const base = previous.key === forKey ? previous : fresh(forKey);
    return { ...base, ...change(base) };
  }), []);

  const reload = useCallback(() => {
    if (!key) return Promise.resolve();
    return repo.listFriends()
      .then((rows) => update(key, () => ({ rows: rows || [], loaded: true, error: '' })))
      .catch((error) => update(key, () => ({ loaded: true, error: 'Could not load your friends: ' + friendlyError(error) })));
  }, [key, update]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => (key && onChange ? onChange(() => { reload(); }) : undefined), [key, onChange, reload]);

  const lastRealtime = useRef(realtime);
  useEffect(() => {
    const previous = lastRealtime.current;
    lastRealtime.current = realtime;
    if (realtime === 'live' && previous === 'offline') reload();
  }, [realtime, reload]);

  const { rows } = current;
  return {
    enabled: Boolean(key),
    rows,
    friends: rows.filter((row) => row.status === 'accepted'),
    incoming: rows.filter((row) => row.status === 'pending' && row.direction === 'incoming'),
    outgoing: rows.filter((row) => row.status === 'pending' && row.direction === 'outgoing'),
    loaded: current.loaded,
    error: current.error,
    reload,
  };
}

/** "Display name (@username)", or the @username alone. */
export const friendLabel = (row) => (row.display_name ? `${row.display_name} (@${row.username})` : '@' + row.username);

/**
 * Accept or decline one friend request, one at a time. Both re-read the list, so every view of it updates.
 */
export function useAnswerFriendRequest({ friends, notify }) {
  const [busyId, setBusyId] = useState(null);
  const working = useRef(false);

  const answer = async (request, accepting) => {
    if (working.current) return;
    working.current = true;
    setBusyId(request.friendship_id);
    try {
      await repo.respondFriendRequest(request.friendship_id, accepting);
      if (accepting) notify.success(`You and @${request.username} are now friends`);
      else notify.info(`Friend request from @${request.username} declined`);
    } catch (failure) {
      notify.error(friendlyError(failure));
    } finally {
      working.current = false;
      setBusyId(null);
      friends.reload();
    }
  };

  return { answer, busyId };
}
