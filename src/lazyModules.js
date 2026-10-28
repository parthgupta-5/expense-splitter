// Every page and dialog that is downloaded only when it is first shown (React.lazy in App.jsx), listed once.
// Tests load them all before rendering, so their waits measure what the screen shows rather than how long a busy
// machine takes to fetch and evaluate a page module the first time. The app itself keeps loading each one on demand.
export const lazyModules = {
  GroupPage: () => import('./pages/GroupPage'),
  AuthModal: () => import('./components/AuthModal'),
  GroupModal: () => import('./components/GroupModal'),
  ImportGuestModal: () => import('./components/ImportGuestModal'),
  UsernameDialog: () => import('./components/UsernameDialog'),
  GroupsPage: () => import('./pages/GroupsPage'),
  HistoryPage: () => import('./pages/HistoryPage'),
  PeoplePage: () => import('./pages/PeoplePage'),
  ProfilePage: () => import('./pages/ProfilePage'),
  SettingsPage: () => import('./pages/SettingsPage'),
  ResetPasswordPage: () => import('./pages/ResetPasswordPage'),
  AuthCallbackPage: () => import('./pages/AuthCallbackPage'),
  PrivacyPage: () => import('./pages/PrivacyPage'),
  TermsPage: () => import('./pages/TermsPage'),
};

/** Loads every lazy page and dialog now (tests only). */
export const preloadLazyModules = () => Promise.all(Object.values(lazyModules).map((load) => load()));
