import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { App as AntApp, ConfigProvider, Form, Layout, Modal, Spin, Typography, message, Button } from 'antd';
import { DownloadOutlined, TeamOutlined } from '@ant-design/icons';
import Dashboard from './components/Dashboard';
import TopBar from './components/TopBar';
import AuthModal from './components/AuthModal';
import GroupModal from './components/GroupModal';
import SnapshotModal from './components/SnapshotModal';
import { useLocalState } from './hooks/useLocalState';
import { useCloudSync } from './hooks/useCloudSync';
import { useExpenseForm } from './hooks/useExpenseForm';
import { removeCloudGroup, supabaseConfigured } from './supabase';
import { parseBackupText } from './lib/backup';
import { toCsv } from './lib/csv';
import { currencySymbol as symbolOf, formatCurrency } from './lib/currency';
import { downloadText } from './lib/download';
import { friendlyError } from './lib/errors';
import { collectSnapshots } from './lib/history';
import { GROUP_NAME_MAX } from './lib/limits';
import { describeRejected, parseNames, removalStatus } from './lib/people';
import { computeBalances, computeSettlements } from './lib/splits';
import { makeId, newGroup } from './lib/storage';
import { buildTheme, requiredMark } from './theme';

const GroupsPage = lazy(() => import('./components/GroupsPage'));
const HistoryPage = lazy(() => import('./components/HistoryPage'));
const PeoplePage = lazy(() => import('./components/PeoplePage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));

const { Content } = Layout;
const { Text, Title } = Typography;

const PAGE_TITLES = {
  groups: 'Saved groups', history: 'Activity history', people: 'Saved people', settings: 'Settings', profile: 'Profile',
};

export default function App() {
  const local = useLocalState();
  const {
    groups, setGroups, activeGroup, activeGroupId, setActiveGroupId, savedPeople, setSavedPeople,
    setPreferences, dark, setDark, people, expenses, payments, currencyCode, patchGroup,
    setPeople, setExpenses, setPayments,
  } = local;
  const [messageApi, contextHolder] = message.useMessage();
  const [profileForm] = Form.useForm();
  const [page, setPage] = useState('dashboard');
  const [nameValue, setNameValue] = useState('');
  const [savedPersonValue, setSavedPersonValue] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [authMode, setAuthMode] = useState(null); // null = closed
  const [pendingAuthAction, setPendingAuthAction] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [groupModal, setGroupModal] = useState(false);

  const cloud = useCloudSync({
    local,
    messageApi,
    onProfileLoaded: (cloudProfile, user) => profileForm.setFieldsValue({
      display_name: cloudProfile?.display_name || (cloudProfile ? '' : user.user_metadata?.display_name || ''),
      avatar_url: cloudProfile?.avatar_url || '',
    }),
    onSignedOut: () => { setSelectedSnapshot(null); setPage('dashboard'); },
  });
  const { user, profile } = cloud;

  const expenseForm = useExpenseForm({ people, expenses, setExpenses, messageApi });
  const balances = useMemo(() => computeBalances(people, expenses, payments), [people, expenses, payments]);
  const settlements = useMemo(() => computeSettlements(balances), [balances]);
  const total = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const formatMoney = (value) => formatCurrency(value, currencyCode);
  const snapshots = collectSnapshots(groups);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openAuth = (action = null) => { setPendingAuthAction(action); setAuthMode('signup'); };

  const saveCurrentSplit = () => {
    if (!activeGroup) return;
    const snapshot = {
      id: makeId(),
      groupName: activeGroup.name,
      savedAt: new Date().toISOString(),
      people: [...people],
      expenses: JSON.parse(JSON.stringify(expenses)),
      payments: JSON.parse(JSON.stringify(payments)),
      settlements: JSON.parse(JSON.stringify(settlements)),
      total,
      currencyCode,
    };
    patchGroup((group) => ({ savedSplits: [snapshot, ...(group.savedSplits || [])] }));
    setPage('history');
    setPendingAuthAction(null);
    messageApi.success(user ? 'Split saved to your account history' : 'Split saved on this device');
  };

  useEffect(() => {
    if (!user || !pendingAuthAction) return;
    if (pendingAuthAction === 'history') setPage('history');
    if (pendingAuthAction === 'save-split') saveCurrentSplit();
    setPendingAuthAction(null);
  }, [user?.id, pendingAuthAction]);

  const exportBackup = () => {
    const backup = { groups, savedPeople, preferences: local.preferences, exportedAt: new Date().toISOString() };
    downloadText('expense-splitter-backup.json', 'application/json', JSON.stringify(backup, null, 2));
    messageApi.success('Backup downloaded');
  };

  const exportCsv = () => {
    const rows = [['Group', 'Date', 'Category', 'Description', 'Paid by', 'Total', 'Split details']];
    expenses.forEach((expense) => rows.push([
      activeGroup?.name, expense.createdAt || '', expense.category || '', expense.description, expense.payer,
      Number(expense.amount) || 0,
      Object.entries(expense.splitDetails || {}).map(([name, amount]) => name + ': ' + formatMoney(amount)).join('; '),
    ]));
    rows.push([], ['Suggested settlements'], ...settlements.map((item) => [item.payer, 'pays', item.payee, item.amount]));
    downloadText('group-settlement.csv', 'text/csv;charset=utf-8', toCsv(rows));
  };

  const copySummary = async () => {
    const summary = settlements.length
      ? settlements.map((item) => item.payer + ' pays ' + item.payee + ' ' + formatMoney(item.amount)).join('\n')
      : 'Everyone is settled up.';
    try {
      await navigator.clipboard.writeText(summary);
      messageApi.success('Settlement copied');
    } catch {
      messageApi.error('Clipboard access is unavailable');
    }
  };

  const importBackup = async (file) => {
    try {
      const backup = parseBackupText(await file.text(), file.size);
      Modal.confirm({
        title: 'Import this backup?',
        content: `${backup.groups.length} group(s) will be added to this device. `
          + 'Groups with matching IDs will use the imported copy.'
          + (backup.skipped ? ` ${backup.skipped} damaged item(s) in the file will be skipped.` : ''),
        okText: 'Import backup',
        onOk: () => {
          setGroups((current) => {
            const imported = new Map(backup.groups.map((group) => [group.id, group]));
            current.forEach((group) => { if (!imported.has(group.id)) imported.set(group.id, group); });
            return [...imported.values()];
          });
          if (backup.savedPeople.length) setSavedPeople((current) => [...new Set([...current, ...backup.savedPeople])]);
          if (Object.keys(backup.preferences).length) setPreferences((current) => ({ ...current, ...backup.preferences }));
          setActiveGroupId(backup.groups[0].id);
          messageApi.success(backup.skipped
            ? `Backup imported. ${backup.skipped} damaged item(s) were skipped.` : 'Backup imported');
        },
      });
    } catch (error) {
      messageApi.error(error.message || 'Could not read this backup file.');
    }
    return false;
  };

  const addPeople = (raw = nameValue) => {
    const parsed = parseNames(raw, people);
    const rejected = describeRejected(parsed);
    if (rejected) messageApi.error('Not added, ' + rejected);
    if (!parsed.valid.length) {
      if (!rejected && raw.trim()) messageApi.warning('Enter a name to add');
      return;
    }
    setPeople((current) => [...current, ...parsed.valid]);
    setSavedPeople((current) => [...current, ...parseNames(parsed.valid.join(','), current).valid]);
    setNameValue('');
    messageApi.success(parsed.valid.length === 1 ? parsed.valid[0] + ' added' : parsed.valid.length + ' people added');
  };

  const removePerson = (name) => {
    const status = removalStatus(name, balances, expenses, payments);
    if (status === 'blocked') {
      messageApi.warning(name + ' still owes or is owed money in this group. '
        + 'Settle up (record a payment) before removing them.');
      return;
    }
    const remove = () => {
      setPeople((current) => current.filter((person) => person !== name));
      messageApi.info(name + ' removed from this group');
    };
    if (status === 'free') { remove(); return; }
    Modal.confirm({
      title: 'Remove ' + name + '?',
      content: 'They are settled up. Their past expenses and payments stay in the group history.',
      okText: 'Remove',
      onOk: remove,
    });
  };

  const addSavedPeople = () => {
    const parsed = parseNames(savedPersonValue, savedPeople);
    const rejected = describeRejected(parsed);
    if (rejected) messageApi.error('Not saved, ' + rejected);
    if (!parsed.valid.length) return;
    setSavedPeople((current) => [...current, ...parsed.valid]);
    setSavedPersonValue('');
    messageApi.success('People saved to your list');
  };

  const addSavedPersonToGroup = (person) => {
    if (people.some((name) => name.toLowerCase() === person.toLowerCase())) {
      messageApi.info(person + ' is already in this group');
      return;
    }
    setPeople((current) => [...current, person]);
    messageApi.success(person + ' added to ' + (activeGroup?.name || 'group'));
  };

  const switchGroup = (groupId) => {
    setActiveGroupId(groupId);
    setPage('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createGroup = (rawName) => {
    const name = String(rawName || '').trim();
    if (!name) { messageApi.error('Add a group name'); return false; }
    if (name.length > GROUP_NAME_MAX) {
      messageApi.error('Group names can have at most ' + GROUP_NAME_MAX + ' characters');
      return false;
    }
    const group = newGroup(name);
    setGroups((current) => [group, ...current]);
    setActiveGroupId(group.id);
    setPage('dashboard');
    setGroupModal(false);
    messageApi.success(group.name + ' created');
    return true;
  };

  const deleteGroup = async (group) => {
    if (groups.length < 2) { messageApi.warning('Keep at least one group'); return; }
    try {
      if (user) await removeCloudGroup(group.id);
    } catch (error) {
      messageApi.error('Cloud delete failed: ' + friendlyError(error));
      return;
    }
    const remaining = groups.filter((item) => item.id !== group.id);
    setGroups(remaining);
    if (activeGroupId === group.id) setActiveGroupId(remaining[0].id);
    messageApi.success('Group deleted');
  };

  const deleteSnapshot = (snapshot) => setGroups((current) => current.map((group) => (group.id === snapshot.groupId
    ? { ...group, savedSplits: (group.savedSplits || []).filter((item) => item.id !== snapshot.id) }
    : group)));

  const requestSaveSplit = () => {
    if (!user && supabaseConfigured) { openAuth('save-split'); return; }
    saveCurrentSplit();
  };

  const requestSignOut = () => {
    const names = cloud.unsyncedGroupNames();
    if (!names.length) { cloud.finishSignOut(); return; }
    Modal.confirm({
      title: 'Some changes are not synced yet',
      content: 'Signing out clears groups from this device. Download a backup first if you want to keep: '
        + names.join(', ') + '.',
      okText: 'Sign out anyway',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <Button icon={<DownloadOutlined />} onClick={exportBackup}>Download backup</Button>
          <CancelBtn />
          <OkBtn />
        </>
      ),
      onOk: cloud.finishSignOut,
    });
  };

  const symbol = symbolOf(currencyCode);
  const dashboardHandlers = {
    addPeople,
    removePerson,
    addPayment: (payment) => setPayments((current) => [payment, ...current]),
    deleteExpense: (id) => setExpenses((current) => current.filter((item) => item.id !== id)),
    deletePayment: (id) => setPayments((current) => current.filter((item) => item.id !== id)),
    saveSplit: requestSaveSplit,
    exportCsv,
    copySummary,
    messageApi,
  };

  const renderPage = () => {
    switch (page) {
      case 'groups':
        return (
          <GroupsPage
            groups={groups} activeGroupId={activeGroupId} currencySymbol={symbol}
            onNew={() => setGroupModal(true)} onOpen={switchGroup} onDelete={deleteGroup}
          />
        );
      case 'history':
        return (
          <HistoryPage
            groups={groups} user={user} cloudConfigured={supabaseConfigured} cloudReady={cloud.cloudReady}
            syncError={cloud.syncError} formatMoney={formatMoney} onSignIn={() => openAuth('history')}
            onExportBackup={exportBackup} onViewSnapshot={setSelectedSnapshot} onDeleteSnapshot={deleteSnapshot}
          />
        );
      case 'people':
        return (
          <PeoplePage
            savedPeople={savedPeople} value={savedPersonValue} onChange={setSavedPersonValue} onSave={addSavedPeople}
            groupName={activeGroup?.name} onAddToGroup={addSavedPersonToGroup}
            onRemove={(person) => setSavedPeople((current) => current.filter((name) => name !== person))}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            currencyCode={currencyCode} dark={dark} user={user}
            onCurrency={(value) => setPreferences((current) => ({ ...current, currency: value }))}
            onToggleDark={() => setDark((value) => !value)} onExportBackup={exportBackup}
            onImportBackup={importBackup} onSignIn={() => openAuth()}
          />
        );
      case 'profile':
        return (
          <ProfilePage
            user={user} form={profileForm} cloudConfigured={supabaseConfigured}
            onSave={cloud.saveProfileChanges} onSignOut={requestSignOut} onSignIn={() => openAuth()}
          />
        );
      default:
        return (
          <Dashboard
            group={activeGroup} people={people} expenses={expenses} payments={payments} balances={balances}
            settlements={settlements} total={total} currencySymbol={symbol} formatMoney={formatMoney}
            isScrolled={isScrolled} peopleInput={{ value: nameValue, setValue: setNameValue }}
            expenseForm={expenseForm} user={user} cloudReady={cloud.cloudReady} syncError={cloud.syncError}
            handlers={dashboardHandlers}
          />
        );
    }
  };

  const isDashboard = page === 'dashboard';
  return (
    <ConfigProvider form={{ requiredMark }} theme={buildTheme(dark)}>
      <AntApp>
        {contextHolder}
        <Layout className="app-layout">
          <TopBar
            page={page} onNavigate={setPage} dark={dark} user={user} profile={profile}
            onToggleDark={() => setDark((value) => !value)}
            counts={{ groups: groups.length, history: user ? snapshots.length : undefined, people: savedPeople.length }}
          />
          <Content className="content" id="top">
            <div className="page-intro">
              <div>
                <Text className="eyebrow">{isDashboard ? 'SHARED SPENDING' : 'EXPENSE SPLITTER'}</Text>
                <Title level={1}>
                  {isDashboard
                    ? <>Good spending starts with <span>good company.</span></>
                    : PAGE_TITLES[page]}
                </Title>
              </div>
              <div className="intro-icon"><TeamOutlined /></div>
            </div>
            <Suspense fallback={<Spin style={{ display: 'block', margin: '48px auto' }} />}>{renderPage()}</Suspense>
          </Content>
        </Layout>
        <AuthModal
          open={authMode !== null}
          mode={authMode || 'signup'}
          onModeChange={setAuthMode}
          onClose={(signedIn) => { setAuthMode(null); if (!signedIn) setPendingAuthAction(null); }}
          messageApi={messageApi}
        />
        <SnapshotModal snapshot={selectedSnapshot} onClose={() => setSelectedSnapshot(null)} />
        <GroupModal open={groupModal} onClose={() => setGroupModal(false)} onCreate={createGroup} />
      </AntApp>
    </ConfigProvider>
  );
}
