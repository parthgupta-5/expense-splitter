import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import { readTheme, saveTheme } from '../lib/storage';
import { buildTheme, requiredMark } from '../theme';
import { useAuth } from './useAuth';
import { useWorkspace } from './useWorkspace';

const AppContext = createContext(null);

/** Everything pages need: auth, workspace data and actions, notifications and app-level UI state. */
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

function AppState({ children, dark, setDark }) {
  const { message, modal } = AntApp.useApp();
  const auth = useAuth();
  const workspace = useWorkspace({ user: auth.user, authReady: auth.ready, notify: message });
  const [authDialog, setAuthDialog] = useState({ open: false, mode: 'signup' });
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);

  const openAuth = useCallback((mode = 'signup') => setAuthDialog({ open: true, mode }), []);
  const closeAuth = useCallback(() => setAuthDialog((current) => ({ ...current, open: false })), []);
  const toggleDark = useCallback(() => setDark((value) => !value), [setDark]);

  const value = useMemo(() => ({
    auth,
    workspace,
    notify: message,
    modal,
    dark,
    toggleDark,
    authDialog,
    setAuthMode: (mode) => setAuthDialog((current) => ({ ...current, mode })),
    openAuth,
    closeAuth,
    groupDialogOpen,
    openGroupDialog: () => setGroupDialogOpen(true),
    closeGroupDialog: () => setGroupDialogOpen(false),
  }), [auth, workspace, message, modal, dark, toggleDark, authDialog, openAuth, closeAuth, groupDialogOpen]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }) {
  const [dark, setDark] = useState(readTheme);
  useEffect(() => {
    saveTheme(dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  return (
    <ConfigProvider form={{ requiredMark }} theme={buildTheme(dark)}>
      <AntApp>
        <AppState dark={dark} setDark={setDark}>{children}</AppState>
      </AntApp>
    </ConfigProvider>
  );
}
