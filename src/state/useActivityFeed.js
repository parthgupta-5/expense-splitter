import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';
import { mergeActivity, newestActivityId } from '../lib/activityFeed';
import { readActivitySeen, writeActivitySeen } from '../lib/storage';

export const FEED_SIZE = 30;
const fresh = (key) => ({
  key, rows: [], loaded: false, loading: false, error: '', seenId: null,
});

/**
 * The signed-in user's recent activity for the bell: the activity log (which Row Level Security limits to the user's
 * own groups), kept current by the workspace's existing live channel and re-read after that channel reconnects or
 * when `reload` is called. What has been seen is remembered on this device only (localStorage), never on the server.
 */
export function useActivityFeed({
  userId, enabled, realtime, onActivity,
}) {
  // Everything belongs to one account's session; another account (or signing out) starts from nothing.
  const key = enabled && userId ? userId : null;
  const [state, setState] = useState(() => fresh(key));
  const feed = state.key === key ? state : fresh(key);
  const keyRef = useRef(key);
  const feedRef = useRef(feed);
  useEffect(() => { keyRef.current = key; feedRef.current = feed; });
  const update = useCallback((forKey, change) => setState((current) => {
    if (forKey !== keyRef.current) return current; // an answer for an earlier session
    const base = current.key === forKey ? current : fresh(forKey);
    return { ...base, ...change(base) };
  }), []);

  const reload = useCallback(() => {
    if (!key) return Promise.resolve();
    update(key, () => ({ loading: true }));
    return repo.fetchActivity(FEED_SIZE)
      .then((rows) => update(key, (current) => {
        const list = rows || [];
        let { seenId } = current;
        // The first time this account uses the bell on this device, what is already there counts as seen.
        if (seenId === null) {
          seenId = readActivitySeen(key) ?? newestActivityId(list) ?? 0;
          writeActivitySeen(key, seenId);
        }
        return {
          rows: mergeActivity(current.rows, list, FEED_SIZE), loaded: true, loading: false, error: '', seenId,
        };
      }))
      .catch((error) => update(key, () => ({ loading: false, error: friendlyError(error) })));
  }, [key, update]);

  useEffect(() => { reload(); }, [reload]);

  // Live rows from the workspace's channel. The same row from a reload and from the channel is kept once.
  useEffect(() => {
    if (!key) return undefined;
    return onActivity((row) => update(key, (current) => ({ rows: mergeActivity(current.rows, [row], FEED_SIZE) })));
  }, [key, onActivity, update]);

  // After the channel comes back, re-read the log to pick up anything written while it was down.
  const lastRealtime = useRef(realtime);
  useEffect(() => {
    const previous = lastRealtime.current;
    lastRealtime.current = realtime;
    if (realtime === 'live' && previous === 'offline') reload();
  }, [realtime, reload]);

  /** Marks everything in the list as seen, on this device only. */
  const markSeen = useCallback(() => {
    const { rows, seenId } = feedRef.current;
    const newest = newestActivityId(rows);
    if (!key || newest === null || seenId === null || newest <= seenId) return;
    writeActivitySeen(key, newest);
    update(key, () => ({ seenId: newest }));
  }, [key, update]);

  return {
    rows: feed.rows,
    loading: feed.loading || (Boolean(key) && !feed.loaded && !feed.error),
    error: feed.error,
    seenId: feed.seenId,
    reload,
    markSeen,
  };
}
