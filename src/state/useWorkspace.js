import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import * as repo from '../data/cloudRepo';
import { DEFAULT_CURRENCY } from '../lib/currency';
import { friendlyError } from '../lib/errors';
import {
  clearGuestState, isNonEmptyGroup, newGroup, readGuestState, writeGuestState,
} from '../lib/storage';
import { initialWorkspace, workspaceReducer } from './workspaceReducer';

const PROFILE_SAVE_DELAY_MS = 600;
const REFRESH_DELAY_MS = 250;

/**
 * The app's data. Signed out: groups live on this device (localStorage). Signed in: Supabase is the source of
 * truth; every action updates the screen immediately (optimistic) and then writes one row. If the write fails,
 * the user is told why and the affected group is re-read from the server, so the screen never lies for long.
 */
export function useWorkspace({ user, authReady, notify }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace);
  const stateRef = useRef(state);
  const notifyRef = useRef(notify);
  useEffect(() => { stateRef.current = state; notifyRef.current = notify; });
  const userId = user?.id ?? null;

  // Load guest or cloud data whenever the signed-in user changes.
  useEffect(() => {
    if (!authReady) return undefined;
    if (!userId) {
      dispatch({ type: 'loadGuest', ...readGuestState() });
      return undefined;
    }
    let cancelled = false;
    dispatch({ type: 'cloudLoading', userId });
    Promise.all([repo.fetchGroups(userId), repo.fetchProfile(userId)])
      .then(([groups, profile]) => {
        if (cancelled) return;
        dispatch({ type: 'loadCloud', userId, groups, profile });
        dispatch({ type: 'setGuestToImport', groups: readGuestState().groups.filter(isNonEmptyGroup) });
      })
      .catch((error) => {
        if (cancelled) return;
        dispatch({ type: 'cloudError', userId });
        notifyRef.current.error('Could not load your account data: ' + friendlyError(error));
      });
    return () => { cancelled = true; };
  }, [authReady, userId]);

  // Guest data is saved on this device after every change.
  useEffect(() => {
    if (state.mode === 'guest' && state.status === 'ready') writeGuestState(state);
  }, [state]);

  // Saved people and the default currency are part of the profile for signed-in users.
  const { mode, status, savedPeople, preferences } = state;
  const profileUserId = state.userId;
  const lastSavedProfile = useRef(null);
  useEffect(() => {
    const key = JSON.stringify([savedPeople, preferences]);
    if (mode !== 'cloud' || status !== 'ready') { lastSavedProfile.current = null; return undefined; }
    if (lastSavedProfile.current === null) { lastSavedProfile.current = key; return undefined; } // just loaded
    if (lastSavedProfile.current === key) return undefined;
    const timer = setTimeout(() => {
      repo.saveProfile(profileUserId, {
        saved_people: savedPeople,
        currency_code: preferences.currency || DEFAULT_CURRENCY,
        preferences,
      })
        .then(() => { lastSavedProfile.current = key; })
        .catch((error) => notifyRef.current.error('Could not save your settings: ' + friendlyError(error)));
    }, PROFILE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, status, profileUserId, savedPeople, preferences]);

  const refreshGroup = useCallback(async (groupId) => {
    const { mode: currentMode, userId: uid } = stateRef.current;
    if (currentMode !== 'cloud') return;
    try {
      const group = await repo.fetchGroup(groupId, uid);
      if (stateRef.current.userId !== uid) return;
      dispatch(group ? { type: 'upsertGroup', group } : { type: 'removeGroup', groupId });
    } catch {
      // Offline or a transient error: the next change event or tab focus retries.
    }
  }, []);

  const reloadAll = useCallback(async () => {
    const { mode: currentMode, userId: uid } = stateRef.current;
    if (currentMode !== 'cloud') return;
    try {
      const groups = await repo.fetchGroups(uid);
      if (stateRef.current.userId === uid) dispatch({ type: 'replaceGroups', groups });
    } catch {
      // Same as above.
    }
  }, []);

  // Live updates from other members, plus a full refresh when the tab becomes visible again.
  useEffect(() => {
    if (mode !== 'cloud' || !profileUserId) return undefined;
    const timers = new Map();
    const schedule = (groupId) => {
      clearTimeout(timers.get(groupId));
      timers.set(groupId, setTimeout(() => { timers.delete(groupId); refreshGroup(groupId); }, REFRESH_DELAY_MS));
    };
    const unsubscribe = repo.subscribeToChanges({
      onGroupChanged: schedule,
      onGroupDeleted: (groupId) => dispatch({ type: 'removeGroup', groupId }),
    });
    const onVisible = () => { if (document.visibilityState === 'visible') reloadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mode, profileUserId, refreshGroup, reloadAll]);

  const actions = useMemo(() => {
    const isCloud = () => stateRef.current.mode === 'cloud';

    /** Optimistic update, then the database write. Resolves to true when the change was kept. */
    const perform = async ({ local, remote, groupId, failure }) => {
      if (local) dispatch(local);
      if (!isCloud()) return true;
      try {
        await remote();
        return true;
      } catch (error) {
        notifyRef.current.error(failure + ': ' + friendlyError(error));
        if (groupId) await refreshGroup(groupId);
        else await reloadAll();
        return false;
      }
    };

    const importGroups = async (groups) => {
      if (!isCloud()) {
        const imported = new Map(groups.map((group) => [group.id, group]));
        stateRef.current.groups.forEach((group) => { if (!imported.has(group.id)) imported.set(group.id, group); });
        dispatch({ type: 'replaceGroups', groups: [...imported.values()] });
        return { imported: groups, failed: [] };
      }
      const result = { imported: [], failed: [] };
      for (const group of groups) {
        try {
          await repo.importGroup(group);
          result.imported.push(group);
        } catch (error) {
          result.failed.push({ group, message: friendlyError(error) });
        }
      }
      await reloadAll();
      return result;
    };

    return {
      createGroup: async (name, currencyCode) => {
        const uid = stateRef.current.userId;
        const group = {
          ...newGroup(name.trim(), currencyCode),
          ...(isCloud() ? { ownerId: uid, role: 'owner', memberCount: 1, cloud: true } : {}),
        };
        const ok = await perform({
          local: { type: 'upsertGroup', group },
          remote: () => repo.createGroup(group, uid),
          failure: 'Could not create the group',
        });
        return ok ? group : null;
      },
      updateGroup: (groupId, { name, currencyCode }) => perform({
        local: { type: 'renameGroup', groupId, name: name.trim(), currencyCode },
        remote: () => repo.updateGroup(groupId, { name, currencyCode }),
        groupId,
        failure: 'Could not update the group',
      }),
      deleteGroup: (groupId) => perform({
        local: { type: 'removeGroup', groupId },
        remote: () => repo.deleteGroup(groupId),
        failure: 'Could not delete the group',
      }),
      leaveGroup: (groupId) => perform({
        local: { type: 'removeGroup', groupId },
        remote: () => repo.removeMember(groupId, stateRef.current.userId),
        failure: 'Could not leave the group',
      }),
      addPeople: (groupId, names) => perform({
        local: { type: 'addPeople', groupId, names },
        remote: () => repo.addPeople(groupId, names),
        groupId,
        failure: 'Could not add people',
      }),
      removePerson: (groupId, name) => perform({
        local: { type: 'removePerson', groupId, name },
        remote: () => repo.removePerson(groupId, name),
        groupId,
        failure: 'Could not remove ' + name,
      }),
      saveExpense: (groupId, expense) => perform({
        local: { type: 'saveExpense', groupId, expense },
        remote: () => repo.saveExpense(groupId, expense),
        groupId,
        failure: 'Could not save the expense',
      }),
      deleteExpense: (groupId, id) => perform({
        local: { type: 'removeExpense', groupId, id },
        remote: () => repo.deleteExpense(id),
        groupId,
        failure: 'Could not delete the expense',
      }),
      addPayment: (groupId, payment) => perform({
        local: { type: 'addPayment', groupId, payment },
        remote: () => repo.addPayment(groupId, payment),
        groupId,
        failure: 'Could not record the payment',
      }),
      deletePayment: (groupId, id) => perform({
        local: { type: 'removePayment', groupId, id },
        remote: () => repo.deletePayment(id),
        groupId,
        failure: 'Could not remove the payment',
      }),
      saveSnapshot: (groupId, snapshot) => perform({
        local: { type: 'addSnapshot', groupId, snapshot },
        remote: () => repo.saveSnapshot(groupId, snapshot),
        groupId,
        failure: 'Could not save the split',
      }),
      deleteSnapshot: (groupId, id) => perform({
        local: { type: 'removeSnapshot', groupId, id },
        remote: () => repo.deleteSnapshot(id),
        groupId,
        failure: 'Could not delete the saved split',
      }),
      setSavedPeople: (savedPeopleOrUpdater) => dispatch({
        type: 'setSavedPeople',
        savedPeople: typeof savedPeopleOrUpdater === 'function'
          ? savedPeopleOrUpdater(stateRef.current.savedPeople)
          : savedPeopleOrUpdater,
      }),
      setPreferences: (patch) => dispatch({ type: 'setPreferences', preferences: patch }),
      setProfile: (profile) => dispatch({ type: 'setProfile', profile }),
      saveProfile: (profile) => repo.saveProfile(stateRef.current.userId, profile),
      /** Sets the username on the server (which enforces every rule), then shows it. Throws the server's reason. */
      setUsername: async (name) => {
        const fields = await repo.setUsername(name);
        dispatch({ type: 'setProfile', profile: { ...stateRef.current.profile, ...fields } });
        return fields;
      },
      importGroups,
      /** Moves the groups that were made while signed out into the account, then removes them from the device. */
      importGuestGroups: async (groups) => {
        const result = await importGroups(groups);
        const failedIds = new Set(result.failed.map((item) => item.group.id));
        const remaining = readGuestState().groups.filter((group) => failedIds.has(group.id));
        if (remaining.length) writeGuestState({ ...readGuestState(), groups: remaining });
        else clearGuestState();
        dispatch({ type: 'setGuestToImport', groups: [] });
        return result;
      },
      dismissGuestImport: ({ discard = false } = {}) => {
        if (discard) clearGuestState();
        dispatch({ type: 'setGuestToImport', groups: [] });
      },
      refreshGroup,
      reload: reloadAll,
    };
  }, [refreshGroup, reloadAll]);

  return { ...state, actions };
}
