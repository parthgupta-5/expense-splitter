import React, { Suspense, lazy, useEffect } from 'react';
import {
  Link, Navigate, Route, Routes, useLocation, useNavigate, useParams,
} from 'react-router';
import {
  Alert, Button, Layout, Result, Spin,
} from 'antd';
import { useApp } from './state/AppContext';
import TopBar from './components/TopBar';
import { readLastGroup } from './lib/storage';

// Pages and dialogs load on demand, so the first download only contains what the current screen needs.
const GroupPage = lazy(() => import('./pages/GroupPage'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const GroupModal = lazy(() => import('./components/GroupModal'));
const ImportGuestModal = lazy(() => import('./components/ImportGuestModal'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const PeoplePage = lazy(() => import('./pages/PeoplePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

const { Content } = Layout;
const loading = <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

/** "/" opens the last group used on this device, or the groups list when there are none. */
function HomeRedirect() {
  const { workspace } = useApp();
  const { groups } = workspace;
  if (!groups.length) return <Navigate replace to="/groups" />;
  const target = groups.find((group) => group.id === readLastGroup()) || groups[0];
  return <Navigate replace to={'/groups/' + target.id} />;
}

/** Remount the group page per group so form state never leaks from one group into another. */
function GroupRoute() {
  const { groupId } = useParams();
  return <GroupPage key={groupId} />;
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

  // The password-reset email link signs the user in; send them to the page where they choose a new password.
  useEffect(() => {
    if (auth.recovering && pathname !== '/reset-password') navigate('/reset-password');
  }, [auth.recovering, pathname, navigate]);

  useEffect(() => { window.scrollTo?.(0, 0); }, [pathname]);

  let body;
  if (!auth.ready || workspace.status === 'loading') {
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
      <Suspense fallback={null}>
        {authDialog.open && <AuthModal />}
        {groupDialogOpen && <GroupModal />}
        {workspace.guestToImport.length > 0 && <ImportGuestModal />}
      </Suspense>
    </Layout>
  );
}
