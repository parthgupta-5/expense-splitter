// Pure state transitions for the workspace (groups, saved people, preferences). The same reducer serves guest
// mode (persisted to this device) and signed-in mode (optimistic updates that mirror database writes).

export const initialWorkspace = {
  mode: 'loading', // 'loading' | 'guest' | 'cloud'
  status: 'loading', // 'loading' | 'ready' | 'error'
  userId: null,
  groups: [],
  savedPeople: [],
  preferences: {},
  profile: null,
  guestToImport: [], // groups made while signed out, offered for import after sign-in
};

const now = () => new Date().toISOString();
const upsertById = (list, item) => (list.some((x) => x.id === item.id)
  ? list.map((x) => (x.id === item.id ? item : x))
  : [item, ...list]);

/** Applies `change(group)` to one group and stamps updatedAt. Unknown ids leave state untouched. */
const updateGroup = (state, groupId, change) => {
  if (!state.groups.some((group) => group.id === groupId)) return state;
  return {
    ...state,
    groups: state.groups.map((group) => (group.id === groupId ? { ...group, ...change(group), updatedAt: now() } : group)),
  };
};

export function workspaceReducer(state, action) {
  switch (action.type) {
    case 'loadGuest':
      return {
        ...initialWorkspace,
        mode: 'guest',
        status: 'ready',
        groups: action.groups,
        savedPeople: action.savedPeople,
        preferences: action.preferences,
      };
    case 'cloudLoading':
      return { ...initialWorkspace, mode: 'cloud', status: 'loading', userId: action.userId };
    case 'loadCloud':
      if (state.userId !== action.userId) return state; // a late response for a user who already signed out
      return {
        ...state,
        status: 'ready',
        groups: action.groups,
        profile: action.profile ?? state.profile,
        savedPeople: action.profile ? action.profile.saved_people || [] : state.savedPeople,
        preferences: action.profile
          ? { ...(action.profile.preferences || {}), currency: action.profile.currency_code || 'INR' }
          : state.preferences,
      };
    case 'setGuestToImport':
      return { ...state, guestToImport: action.groups };
    case 'cloudError':
      return state.userId === action.userId ? { ...state, status: 'error' } : state;
    case 'setProfile':
      return { ...state, profile: action.profile };

    case 'setSavedPeople':
      return { ...state, savedPeople: action.savedPeople };
    case 'setPreferences':
      return { ...state, preferences: { ...state.preferences, ...action.preferences } };

    case 'replaceGroups':
      return { ...state, groups: action.groups };
    case 'upsertGroup':
      return { ...state, groups: upsertById(state.groups, action.group) };
    case 'removeGroup':
      return { ...state, groups: state.groups.filter((group) => group.id !== action.groupId) };
    case 'renameGroup':
      return updateGroup(state, action.groupId, () => ({ name: action.name, currencyCode: action.currencyCode }));

    case 'addPeople':
      return updateGroup(state, action.groupId, (group) => ({ people: [...group.people, ...action.names] }));
    case 'removePerson':
      return updateGroup(state, action.groupId, (group) => ({ people: group.people.filter((p) => p !== action.name) }));

    case 'saveExpense':
      return updateGroup(state, action.groupId, (group) => ({ expenses: upsertById(group.expenses, action.expense) }));
    case 'removeExpense':
      return updateGroup(state, action.groupId, (group) => ({ expenses: group.expenses.filter((e) => e.id !== action.id) }));

    case 'addPayment':
      return updateGroup(state, action.groupId, (group) => ({ payments: [action.payment, ...group.payments] }));
    case 'removePayment':
      return updateGroup(state, action.groupId, (group) => ({ payments: group.payments.filter((p) => p.id !== action.id) }));

    case 'addSnapshot':
      return updateGroup(state, action.groupId, (group) => ({ savedSplits: [action.snapshot, ...(group.savedSplits || [])] }));
    case 'removeSnapshot':
      return updateGroup(state, action.groupId, (group) => ({
        savedSplits: (group.savedSplits || []).filter((s) => s.id !== action.id),
      }));

    default:
      throw new Error('Unknown workspace action: ' + action.type);
  }
}
