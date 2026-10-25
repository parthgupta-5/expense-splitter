import { useEffect, useState } from 'react';
import {
  fetchCloudGroups, fetchProfile, saveCloudGroups, saveProfile, supabase,
} from '../supabase';
import { friendlyError } from '../lib/errors';
import { mergeGroups } from '../lib/sync';
import {
  isNonEmptyGroup, legacyGroup, readLastUser, readSyncMeta, writeLastUser, writeSyncMeta,
} from '../lib/storage';

const SAVE_DELAY_MS = 650;

/**
 * Supabase session, cloud load/merge on sign-in, debounced group saves and profile sync.
 * Everything is a no-op when Supabase is not configured (guest mode).
 */
export function useCloudSync({ local, messageApi, onProfileLoaded, onSignedOut }) {
  const {
    groups, setGroups, groupsRef, savedPeople, setSavedPeople, preferences, setPreferences,
    currencyCode, resetLocalState,
  } = local;
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const result = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => result.data.subscription.unsubscribe();
  }, []);

  // Load cloud data and merge it with this device when a user signs in.
  useEffect(() => {
    if (!supabase || !user) { setCloudReady(false); setProfile(null); return undefined; }
    let cancelled = false;
    setCloudReady(false);
    const lastUserId = readLastUser();
    const differentUser = Boolean(lastUserId) && lastUserId !== user.id;
    if (differentUser) {
      // Another account used this device: never merge its local data into this account.
      setSavedPeople([]);
      setPreferences({});
      writeSyncMeta({});
    }
    Promise.all([fetchCloudGroups(user.id), fetchProfile(user.id)]).then(([cloudGroups, cloudProfile]) => {
      if (cancelled) return;
      writeLastUser(user.id);
      setSyncError(false);
      const merge = mergeGroups({
        local: groupsRef.current, cloud: cloudGroups, meta: readSyncMeta(), userId: user.id, isNewAccount: differentUser,
      });
      setGroups(merge.groups.length ? merge.groups : [legacyGroup({})]);
      const previousMeta = readSyncMeta();
      const syncedNow = previousMeta.userId === user.id ? { ...previousMeta.groups } : {};
      cloudGroups.forEach((cloudGroup) => {
        const kept = merge.groups.some((g) => g.id === cloudGroup.id && g.updatedAt === cloudGroup.updatedAt);
        if (kept) syncedNow[cloudGroup.id] = cloudGroup.updatedAt;
      });
      writeSyncMeta({ userId: user.id, groups: syncedNow });
      if (merge.replacedLocal.length) {
        messageApi.warning('Newer cloud changes replaced your unsynced edits to: ' + merge.replacedLocal.join(', '));
      }
      if (merge.droppedLocal.length) {
        messageApi.info('Removed groups deleted on another device: ' + merge.droppedLocal.join(', '));
      }
      if (cloudProfile) {
        setProfile(cloudProfile);
        setSavedPeople(cloudProfile.saved_people || []);
        setPreferences((current) => ({
          ...current, ...(cloudProfile.preferences || {}), currency: cloudProfile.currency_code || 'INR',
        }));
      }
      onProfileLoaded?.(cloudProfile, user);
      setCloudReady(true);
    }).catch((error) => {
      if (cancelled) return;
      messageApi.error('Could not load cloud data: ' + friendlyError(error));
      setSyncError(true);
      setCloudReady(true);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Debounced save of changed groups only.
  useEffect(() => {
    if (!supabase || !user || !cloudReady) return undefined;
    const timer = window.setTimeout(() => {
      const meta = readSyncMeta();
      const known = meta.userId === user.id ? meta.groups || {} : {};
      const changed = groups.filter((group) => known[group.id] !== group.updatedAt);
      if (!changed.length) return;
      saveCloudGroups(changed, user.id).then(({ saved, failed }) => {
        const synced = { ...known };
        saved.forEach(({ id }) => { synced[id] = groups.find((g) => g.id === id)?.updatedAt; });
        writeSyncMeta({ userId: user.id, groups: synced });
        setSyncError(failed.length > 0);
        if (failed.length) {
          const names = failed.map((item) => item.name || 'Untitled group').join(', ');
          messageApi.error('Could not sync: ' + names + '. Your data is still saved on this device.');
        }
      }).catch((error) => {
        setSyncError(true);
        messageApi.error('Cloud save failed: ' + friendlyError(error));
      });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [groups, user?.id, cloudReady]);

  const profilePayload = (base) => ({
    display_name: base?.display_name || user?.user_metadata?.display_name || '',
    avatar_url: base?.avatar_url || '',
    currency_code: currencyCode,
    preferences,
    saved_people: savedPeople,
    updated_at: new Date().toISOString(),
  });

  useEffect(() => {
    if (user && cloudReady) {
      saveProfile(user.id, profilePayload(profile))
        .catch((error) => messageApi.error('Profile sync failed: ' + friendlyError(error)));
    }
  }, [preferences, savedPeople]);

  const saveProfileChanges = async (values) => {
    const updated = { ...(profile || {}), display_name: values.display_name || '', avatar_url: values.avatar_url || '' };
    setProfile(updated);
    if (!user) { messageApi.success('Profile saved on this device. Sign in to sync it.'); return; }
    try {
      await saveProfile(user.id, { ...updated, ...profilePayload(updated) });
      await supabase.auth.updateUser({ data: { display_name: values.display_name || '' } });
      messageApi.success('Profile saved to your account');
    } catch (error) {
      messageApi.error('Profile save failed: ' + friendlyError(error));
    }
  };

  /** Names of non-empty groups whose latest changes have not reached the cloud. */
  const unsyncedGroupNames = () => {
    const meta = readSyncMeta();
    const sameUser = meta.userId === user?.id;
    return groups
      .filter((group) => isNonEmptyGroup(group) && !(sameUser && meta.groups?.[group.id] === group.updatedAt))
      .map((group) => group.name);
  };

  const finishSignOut = async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (error) {
      messageApi.error('Could not sign out: ' + friendlyError(error));
      return;
    }
    setUser(null);
    setProfile(null);
    setCloudReady(false);
    resetLocalState();
    onSignedOut?.();
    messageApi.success('Signed out. This device no longer holds your groups.');
  };

  return {
    user, profile, setProfile, cloudReady, syncError, saveProfileChanges, unsyncedGroupNames, finishSignOut,
  };
}
