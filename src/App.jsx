import React, {
  Suspense, lazy, useEffect, useState,
} from 'react';
import {
  Link, Navigate, Route, Routes, useLocation, useNavigate, useParams,
} from 'react-router';
import {
  Alert, Button, Layout, Result, Spin,
} from 'antd';
import { useApp } from './state/AppContext';
import TopBar from './components/TopBar';
import AppFooter from './components/AppFooter';
import { readLastGroup } from './lib/storage';
import { needsUsername } from './lib/username';
import { CALLBACK_PATH } from './lib/authRedirect';
import { findGroup, groupPath } from './lib/groupSlug';

// Pages and dialogs load on demand, so the first download only contains what the current screen needs.
const GroupPage = lazy(() => import('./pages/GroupPage'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const GroupModal = lazy(() => import('./components/GroupModal'));
const ImportGuestModal = lazy(() => import('./components/ImportGuestModal'));
const UsernameDialog = lazy(() => import('./components/UsernameDialog'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const PeoplePage = lazy(() => import('./pages/PeoplePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
// Public pages that never wait for account data (they need none) and are never covered by the username dialog.
const LEGAL_PAGES = { '/privacy': PrivacyPage, '/terms': TermsPage };

const { Content } = Layout;
const loading = <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

/** "/" opens the last group used on this device, or the groups list when there are none. */
function HomeRedirect() {
  const { workspace } = useApp();
  const { groups } = workspace;
  if (!groups.length) return <Navigate replace to="/groups" />;
  const target = groups.find((group) => group.id === readLastGroup()) || groups[0];
  return <Navigate replace to={groupPath(target, groups)} />;
}

/**
 * /groups/goa-trip (or an old /groups/<id> link) opens that group, and the address bar is tidied to the readable
 * form. The group is remembered by id, so renaming it (here or by another member) moves the address instead of
 * losing the page. Remounts per group so form state never leaks from one group into another.
 */
function GroupRoute() {
  const { groupId: segment } = useParams();
  const { workspace } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { groups } = workspace;
  const [openedId, setOpenedId] = useState(null);
  const group = findGroup(groups, segment) || groups.find((item) => item.id === openedId) || null;
  if (group && group.id !== openedId) setOpenedId(group.id);
  const canonical = group ? groupPath(group, groups) : null;

  useEffect(() => {
    if (canonical && pathname !== canonical) navigate(canonical, { replace: true });
  }, [canonical, pathname, navigate]);

  const id = group?.id ?? segment;
  return <GroupPage key={id} groupId={id} />;
}

function NotFoundPage() {
  return (
    <Result
      status="404"
      className="not-found"
      title="Page not found"
      subTitle="That address does not match any page in Expense Splitter."
      extra={<Link to="/"><Button type="primary">Go to your groups</Button></Link>}
    />
  );
}

export default function App() {
  const {
    auth, workspace, authDialog, groupDialogOpen,
  } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // An account still on its provisional user_ name must choose a username before anything else (except finishing a
  // sign-in or a password reset).
  const LegalPage = LEGAL_PAGES[pathname];
  const chooseUsername = workspace.mode === 'cloud' && workspace.status === 'ready' && !auth.recovering
    && pathname !== CALLBACK_PATH && !LegalPage && needsUsername(workspace.profile);

  // The password-reset email link signs the user in; send them to the page where they choose a new password.
  useEffect(() => {
    if (auth.recovering && pathname !== '/reset-password') navigate('/reset-password');
  }, [auth.recovering, pathname, navigate]);

  useEffect(() => { window.scrollTo?.(0, 0); }, [pathname]);

  let body;
  if (pathname === CALLBACK_PATH) {
    // Stays mounted while the new session's data loads, so the sign-in can finish and move on.
    body = <Suspense fallback={loading}><AuthCallbackPage /></Suspense>;
  } else if (LegalPage) {
    body = <Suspense fallback={loading}><LegalPage /></Suspense>;
  } else if (!auth.ready || workspace.status === 'loading') {
    body = loading;
  } else if (workspace.status === 'error') {
    body = (
      <Alert
        type="error"
        showIcon
        title="Your account data could not be loaded"
        description="Check your internet connection. Nothing has been lost."
        action={<Button onClick={() => window.location.reload()}>Try again</Button>}
      />
    );
  } else {
    body = (
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:groupId" element={<GroupRoute />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Layout className="app-layout">
      <a className="skip-link" href="#main">Skip to content</a>
      <TopBar />
      <Content className="content" id="main" tabIndex={-1}>{body}</Content>
      <AppFooter />
      <Suspense fallback={null}>
        {authDialog.open && <AuthModal />}
        {groupDialogOpen && <GroupModal />}
        {chooseUsername && <UsernameDialog open required />}
        {workspace.guestToImport.length > 0 && !chooseUsername && <ImportGuestModal />}
      </Suspense>
    </Layout>
  );
}
