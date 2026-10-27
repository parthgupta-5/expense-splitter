import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfigProvider } from 'antd';
import { useApp } from '../state/AppContext';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { useOnline } from '../hooks/useMediaQuery';
import ActivityPanel from '../components/ActivityPanel';
import BalancesPanel from '../components/BalancesPanel';
import ExpenseSheet from '../components/ExpenseForm';
import GroupSettingsModal from '../components/GroupSettingsModal';
import MembersModal from '../components/MembersModal';
import PeoplePanel from '../components/PeoplePanel';
import SettleSheet, { SettlePlan } from '../components/PaymentForm';
import Icon from '../components/group/Icons';
import OverflowMenu from '../components/group/OverflowMenu';
import PersonMark, { MarksContext, assignMarks } from '../components/group/PersonMark';
import { ConfirmDialog, Sheet } from '../components/group/Sheet';
import { buildGroupTheme } from '../theme';
import { toCsv } from '../lib/csv';
import { currencySymbol, formatCurrency } from '../lib/currency';
import { downloadText } from '../lib/download';
import { describeRejected, parseNames, removalStatus } from '../lib/people';
import { computeBalances, computeSettlements, sumAmounts } from '../lib/splits';
import { makeId, writeLastGroup } from '../lib/storage';
import '../group.css';

const EMPTY = [];

function StatusLine({ group, shared, online, onSignIn }) {
  return (
    <div className="gp-status-block">
      <p className="gp-status" role="status">
        <span className={'gp-dot' + (group.cloud ? ' is-synced' : '')} aria-hidden="true" />
        {group.cloud
          ? 'Synced to your account · live updates on' + (shared ? ' · shared with ' + group.memberCount + ' members' : '')
          : 'Saved on this device · only you can see this group'}
        {!group.cloud && (
          <>
            {' · '}
            <button type="button" className="gp-link" onClick={onSignIn}>Sign in to share</button>
          </>
        )}
      </p>
      {group.cloud && !online && (
        <p className="gp-status is-offline" role="status">
          <Icon name="offline" size={16} />
          You’re offline. Changes can’t be saved until your connection returns.
        </p>
      )}
    </div>
  );
}

export default function GroupPage() {
  const { groupId } = useParams();
  const {
    workspace, notify, dark, toggleDark, openAuth,
  } = useApp();
  const { actions } = workspace;
  const navigate = useNavigate();
  const online = useOnline();
  const group = workspace.groups.find((item) => item.id === groupId);
  const [nameValue, setNameValue] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settle, setSettle] = useState({ open: false, draft: null });
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const freshTimer = useRef(null);

  const people = group?.people ?? EMPTY;
  const expenses = group?.expenses ?? EMPTY;
  const payments = group?.payments ?? EMPTY;
  const currencyCode = group?.currencyCode;
  // Cheap pure functions over a few hundred items at most, so they simply run on every render.
  const balances = computeBalances(people, expenses, payments);
  const settlements = computeSettlements(balances);
  const total = sumAmounts(expenses.map((expense) => expense.amount));
  const formatMoney = (value) => formatCurrency(value, currencyCode);
  const symbol = currencySymbol(currencyCode);

  const expenseForm = useExpenseForm({
    people, expenses, notify, onSave: (expense) => actions.saveExpense(groupId, expense),
  });

  useEffect(() => { if (group) writeLastGroup(group.id); }, [group]);
  useEffect(() => {
    document.title = group ? group.name + ' · Expense Splitter' : 'Group not found · Expense Splitter';
  }, [group]);
  useEffect(() => () => clearTimeout(freshTimer.current), []);

  if (!group) {
    return (
      <div className="gp">
        <div className="gp-empty gp-not-found" role="alert">
          <h1 className="gp-title">Group not found</h1>
          <p className="gp-empty-text">It may have been deleted, or you are no longer a member.</p>
          <Link to="/groups" className="gp-button is-primary">See your groups</Link>
        </div>
      </div>
    );
  }

  const flash = (id) => {
    setFreshId(id);
    clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setFreshId(null), 2400);
  };

  const addPeople = async (raw = nameValue) => {
    const parsed = parseNames(raw, people);
    const rejected = describeRejected(parsed);
    if (rejected) notify.error('Not added, ' + rejected);
    if (!parsed.valid.length) {
      if (!rejected && raw.trim()) notify.warning('Enter a name to add');
      return;
    }
    setNameValue('');
    if (!await actions.addPeople(groupId, parsed.valid)) return;
    actions.setSavedPeople((current) => [...current, ...parseNames(parsed.valid.join(','), current).valid]);
    notify.success(parsed.valid.length === 1 ? parsed.valid[0] + ' added' : parsed.valid.length + ' people added');
  };

  const removePerson = (name) => {
    const status = removalStatus(name, balances, expenses, payments);
    if (status === 'blocked') {
      notify.warning(name + ' still owes or is owed money in this group. Settle up (record a payment) before removing them.');
      return;
    }
    const remove = async () => {
      if (await actions.removePerson(groupId, name)) notify.info(name + ' removed from this group');
    };
    if (status === 'free') { remove(); return; }
    setConfirmRequest({
      title: 'Remove ' + name + '?',
      content: 'They are settled up. Their past expenses and payments stay in the group history.',
      okText: 'Remove',
      danger: true,
      onOk: remove,
    });
  };

  const saveSplit = async () => {
    const snapshot = {
      id: makeId(),
      groupName: group.name,
      savedAt: new Date().toISOString(),
      people: [...people],
      expenses: structuredClone(expenses),
      payments: structuredClone(payments),
      settlements: structuredClone(settlements),
      total,
      currencyCode,
    };
    if (await actions.saveSnapshot(groupId, snapshot)) notify.success('Split saved. Find it under History.');
  };

  const exportCsv = () => {
    const rows = [['Group', 'Date', 'Category', 'Description', 'Paid by', 'Total (' + currencyCode + ')', 'Split details']];
    expenses.forEach((expense) => rows.push([
      group.name, expense.createdAt || '', expense.category || '', expense.description, expense.payer,
      Number(expense.amount) || 0,
      Object.entries(expense.splitDetails || {}).map(([name, amount]) => name + ': ' + formatMoney(amount)).join('; '),
    ]));
    rows.push([], ['Suggested settlements'], ...settlements.map((item) => [item.payer, 'pays', item.payee, item.amount]));
    const safeName = group.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'group';
    downloadText(safeName + '-settlement.csv', 'text/csv;charset=utf-8', toCsv(rows));
  };

  const copySummary = async () => {
    const summary = settlements.length
      ? settlements.map((item) => item.payer + ' pays ' + item.payee + ' ' + formatMoney(item.amount)).join('\n')
      : 'Everyone is settled up.';
    try {
      await navigator.clipboard.writeText(group.name + '\n' + summary);
      notify.success('Settlement copied');
    } catch {
      notify.error('Clipboard access is unavailable');
    }
  };

  const closeExpense = (savedId) => {
    setExpenseOpen(false);
    if (typeof savedId === 'string') flash(savedId);
    else if (expenseForm.editingId !== null) expenseForm.reset();
  };
  const startEdit = (id) => { if (expenseForm.edit(id)) setExpenseOpen(true); };
  const addPayment = async (payment) => {
    const kept = await actions.addPayment(groupId, payment);
    if (kept) flash(payment.id);
    return kept;
  };
  const closeSettle = () => setSettle({ open: false, draft: null });
  const openSettle = (draft = null) => setSettle({ open: true, draft });

  const marks = assignMarks(people);
  const shared = group.cloud && group.memberCount > 1;
  const empty = !expenses.length && !payments.length;
  const menuItems = [
    { label: 'Share this group', group: 'group', onSelect: () => setMembersOpen(true) },
    { label: 'Group settings', group: 'group', onSelect: () => setSettingsOpen(true) },
    { label: 'Save split', group: 'data', disabled: empty, onSelect: saveSplit },
    { label: 'Export CSV', group: 'data', onSelect: exportCsv },
    { label: 'Copy settlement', group: 'data', onSelect: copySummary },
    { label: 'All groups', group: 'go', onSelect: () => navigate('/groups') },
    { label: 'History', group: 'go', onSelect: () => navigate('/history') },
    { label: 'Saved people', group: 'go', onSelect: () => navigate('/people') },
    { label: 'Settings', group: 'go', onSelect: () => navigate('/settings') },
    { label: 'Account', group: 'go', onSelect: () => navigate('/profile') },
    { label: dark ? 'Switch to light appearance' : 'Switch to dark appearance', group: 'theme', onSelect: toggleDark },
  ];

  return (
    <ConfigProvider theme={buildGroupTheme(dark)}>
      <MarksContext.Provider value={marks}>
      <div className="gp">
        <header className="gp-header">
          <div className="gp-bar">
            <Link to="/groups" className="gp-icon-button" aria-label="Back to your groups"><Icon name="back" /></Link>
            <OverflowMenu label="Group options" items={menuItems} />
          </div>
          <h1 className="gp-title">{group.name}</h1>
          <div className="gp-total">
            <span className="gp-total-label">Total spent</span>
            <span className="gp-total-figure">{formatMoney(total)}</span>
          </div>
          <div className="gp-meta">
            <button
              type="button"
              className="gp-people-button"
              onClick={() => setPeopleOpen(true)}
              aria-label={'Manage people, ' + people.length + (people.length === 1 ? ' person' : ' people') + ' in this group'}
            >
              <span className="gp-mark-stack" aria-hidden="true">
                {people.slice(0, 5).map((name) => <PersonMark key={name} name={name} size={28} />)}
              </span>
              <span>{people.length} {people.length === 1 ? 'person' : 'people'}</span>
            </button>
            <span className="gp-chip-static">{group.currencyCode}</span>
            {shared && <span className="gp-chip-static">Shared · {group.memberCount} members</span>}
          </div>
          <StatusLine group={group} shared={shared} online={online} onSignIn={() => openAuth('signup')} />
          {people.length > 0 && (
            <div className="gp-dock">
              <button type="button" className="gp-button is-primary is-wide" onClick={() => setExpenseOpen(true)}>
                <Icon name="plus" size={18} /> Add expense
              </button>
              <button type="button" className="gp-button" onClick={() => openSettle()}>
                Settle up{settlements.length > 0 && <span className="gp-count">{settlements.length}</span>}
              </button>
            </div>
          )}
        </header>

        {people.length === 0 ? (
          <section className="gp-start" aria-labelledby="gp-start-title">
            <h2 id="gp-start-title" className="gp-h2">Who’s splitting?</h2>
            <p className="gp-lede">Add everyone who shares costs in this group. Friends don’t need an account.</p>
            <PeoplePanel
              people={people}
              value={nameValue}
              onChange={setNameValue}
              onAdd={addPeople}
              onRemove={removePerson}
              autoFocus
            />
          </section>
        ) : (
          <div className="gp-body">
            <aside className="gp-rail" aria-label="Balances and settling up">
              <section aria-labelledby="gp-balances-title">
                <h2 className="gp-h2" id="gp-balances-title">Balances</h2>
                <BalancesPanel balances={balances} formatMoney={formatMoney} />
              </section>
              <section className="gp-plan" aria-labelledby="gp-plan-title">
                <h2 className="gp-h2" id="gp-plan-title">Settle up</h2>
                <SettlePlan
                  settlements={settlements}
                  formatMoney={formatMoney}
                  onMarkPaid={(item) => openSettle({
                    key: makeId(), payer: item.payer, payee: item.payee, amount: Number(item.amount).toFixed(2),
                  })}
                />
                <button type="button" className="gp-button is-quiet" onClick={() => openSettle({ key: makeId() })}>
                  Record a different payment
                </button>
              </section>
            </aside>
            <ActivityPanel
              expenses={expenses}
              payments={payments}
              formatMoney={formatMoney}
              freshId={freshId}
              onAdd={() => setExpenseOpen(true)}
              onEditExpense={startEdit}
              onDeleteExpense={(expense) => setConfirmRequest({
                title: 'Delete this expense?',
                content: expense.description + ' · ' + formatMoney(expense.amount),
                okText: 'Delete',
                danger: true,
                onOk: async () => { if (await actions.deleteExpense(groupId, expense.id)) notify.success('Expense deleted'); },
              })}
              onDeletePayment={(payment) => setConfirmRequest({
                title: 'Remove this payment?',
                content: payment.payer + ' to ' + payment.payee + ' · ' + formatMoney(payment.amount),
                okText: 'Remove',
                danger: true,
                onOk: async () => { if (await actions.deletePayment(groupId, payment.id)) notify.success('Payment removed'); },
              })}
            />
          </div>
        )}

        <ExpenseSheet
          open={expenseOpen}
          onClose={closeExpense}
          expenseForm={expenseForm}
          people={people}
          currencySymbol={symbol}
          formatMoney={formatMoney}
        />
        <SettleSheet
          open={settle.open}
          onClose={closeSettle}
          draft={settle.draft}
          setDraft={(draft) => setSettle((current) => ({ ...current, draft }))}
          people={people}
          balances={balances}
          settlements={settlements}
          currencySymbol={symbol}
          formatMoney={formatMoney}
          onAddPayment={addPayment}
          notify={notify}
          confirm={setConfirmRequest}
        />
        <Sheet open={peopleOpen} onClose={() => setPeopleOpen(false)} title={'People in ' + group.name}>
          <PeoplePanel
            people={people}
            value={nameValue}
            onChange={setNameValue}
            onAdd={addPeople}
            onRemove={removePerson}
            inputLabel="Add people to this group"
          />
        </Sheet>
        <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
        <MembersModal group={group} open={membersOpen} onClose={() => setMembersOpen(false)} />
        <GroupSettingsModal group={group} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
      </MarksContext.Provider>
    </ConfigProvider>
  );
}
