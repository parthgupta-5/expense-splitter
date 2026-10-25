import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearUserData, legacyGroup, readSaved, readTheme, saveState, saveTheme,
} from '../lib/storage';

/** Groups, saved people, preferences and theme, persisted to localStorage. */
export function useLocalState() {
  const saved = useMemo(readSaved, []);
  const [groups, setGroups] = useState(() => (
    Array.isArray(saved.groups) && saved.groups.length ? saved.groups : [legacyGroup(saved)]
  ));
  const [activeGroupId, setActiveGroupId] = useState(saved.activeGroupId || saved.groups?.[0]?.id);
  const [savedPeople, setSavedPeople] = useState(
    Array.isArray(saved.savedPeople) ? saved.savedPeople : (saved.names || []),
  );
  const [preferences, setPreferences] = useState(saved.preferences || {});
  const [dark, setDark] = useState(readTheme);

  // Lets async code (cloud load) read the latest groups without stale closures.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const people = activeGroup?.people || [];
  const expenses = activeGroup?.expenses || [];
  const payments = activeGroup?.payments || [];
  const currencyCode = preferences.currency || 'INR';

  const patchGroup = (updater) => {
    if (!activeGroup) return;
    setGroups((current) => current.map((group) => (group.id === activeGroup.id
      ? { ...group, ...(typeof updater === 'function' ? updater(group) : updater), updatedAt: new Date().toISOString() }
      : group)));
  };
  const updateGroupList = (key, updater) => patchGroup((group) => ({
    [key]: typeof updater === 'function' ? updater(group[key] || []) : updater,
  }));

  useEffect(() => {
    saveState({
      groups, activeGroupId: activeGroup ? activeGroup.id : null, savedPeople, preferences,
    });
  }, [groups, activeGroupId, activeGroup, savedPeople, preferences]);

  useEffect(() => {
    saveTheme(dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  /** Replaces everything with a fresh default group and clears stored user data. */
  const resetLocalState = () => {
    const fresh = legacyGroup({});
    setGroups([fresh]);
    setActiveGroupId(fresh.id);
    setSavedPeople([]);
    setPreferences({});
    clearUserData();
  };

  return {
    groups, setGroups, groupsRef, activeGroup, activeGroupId, setActiveGroupId,
    savedPeople, setSavedPeople, preferences, setPreferences, dark, setDark,
    people, expenses, payments, currencyCode, patchGroup,
    setPeople: (updater) => updateGroupList('people', updater),
    setExpenses: (updater) => updateGroupList('expenses', updater),
    setPayments: (updater) => updateGroupList('payments', updater),
    resetLocalState,
  };
}
