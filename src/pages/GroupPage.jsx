import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Button, Modal, Result, Tag, Tooltip,
} from 'antd';
import {
  CheckCircleFilled, CloudOutlined, DownloadOutlined, PlusOutlined, SaveOutlined, SettingOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { useExpenseForm } from '../hooks/useExpenseForm';
import ExpenseForm from '../components/ExpenseForm';
import GroupSettingsModal from '../components/GroupSettingsModal';
import GroupTabs from '../components/GroupTabs';
import MembersModal from '../components/MembersModal';
import { useDocumentTitle } from '../components/PageIntro';
import PaymentForm from '../components/PaymentForm';
import PeoplePanel from '../components/PeoplePanel';
import WelcomePanel from '../components/WelcomePanel';
import { toCsv } from '../lib/csv';
import { currencySymbol, formatCents } from '../lib/currency';
import { downloadText } from '../lib/download';
import { centsToDecimalNumber, sumCents } from '../lib/money';
import { describeRejected, parseNames, removalStatus } from '../lib/people';
import { settlementSummary } from '../lib/settlementText';
import { computeBalances, computeSettlements } from '../lib/splits';
import { makeId, writeLastGroup } from '../lib/storage';

const EMPTY = [];

/** Where the group is kept. "Live updates on" only while the live channel is actually connected. */
function SaveStatus({ cloud, realtime }) {
  if (!cloud) return <Tag bordered={false} icon={<CheckCircleFilled />} color="success">Saved on this device</Tag>;
  return (
    <Tag bordered={false} icon={<CloudOutlined />} color="blue">
      {realtime === 'live' ? 'Saved to your account · live updates on' : 'Saved to your account'}
    </Tag>
  );
}

/** "Shared · 2 members · INR", "1 member · INR" or "Saved on this device · INR". */
function groupSubtitle(group) {
  if (!group.cloud) return `Saved on this device · ${group.currencyCode}`;
  const members = group.memberCount === 1 ? '1 member' : `${group.memberCount} members`;
  return (group.memberCount > 1 ? 'Shared · ' : '') + members + ' · ' + group.currencyCode;
}

/** Scrolls to an element and moves keyboard focus to it (it needs tabIndex -1). */
const goTo = (id) => {
  const target = document.getElementById(id);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  target?.focus?.({ preventScroll: true });
};

/**
 * One group's page: a compact header (name, sharing, currency, Members and Group settings), the three figures that
 * matter (group spend, participants, what is left to settle, in words), Add expense as the main action, then the
 * Expenses / Balances / Payments tabs and the participants. Adding or editing an expense happens in a dialog.
 * `groupId` is the group's id (the route works out which group an address refers to).
 */
export default function GroupPage({ groupId }) {
  const {
    auth, workspace, notify, modal,
  } = useApp();
  const { actions, realtime } = workspace;
  const group = workspace.groups.find((item) => item.id === groupId);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [tab, setTab] = useState('expenses');
  useDocumentTitle(group?.name || 'Group not found');

  const people = group?.people ?? EMPTY;
  const expenses = group?.expenses ?? EMPTY;
  const payments = group?.payments ?? EMPTY;
  const currencyCode = group?.currencyCode;
  // Cheap pure functions over a few hundred items at most, so they simply run on every render.
  const balances = computeBalances(people, expenses, payments);
  const settlements = computeSettlements(balances);
  const totalCents = sumCents(expenses.map((expense) => expense.amountCents));
  const formatMoney = (cents) => formatCents(cents, currencyCode);
  const symbol = currencySymbol(currencyCode);
  // The signed-in user's own person in this group, if they are in its expenses (never in guest groups).
  const me = group?.cloud
    ? group.personRecords?.find((record) => record.userId && record.userId === auth.user?.id)?.name ?? null
    : null;

  const expenseForm = useExpenseForm({
    people,
    expenses,
    notify,
    onSave: async (expense) => {
      const kept = await actions.saveExpense(groupId, expense);
      if (kept) setExpenseOpen(false);
      return kept;
    },
  });

  useEffect(() => { if (group) writeLastGroup(group.id); }, [group]);

  // The dialog's form stays mounted (so an edit can fill it before it opens); focus moves into it when it opens.
  useEffect(() => {
    if (!expenseOpen) return undefined;
    const frame = requestAnimationFrame(() => document.querySelector('#add-expense input')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [expenseOpen]);

  if (!group) {
    return (
      <Result
        status="404"
        className="not-found"
        title="Group not found"
        subTitle="It may have been deleted, or you are no longer a member."
        extra={<Link to="/groups"><Button type="primary">See your groups</Button></Link>}
      />
    );
  }

  /** Adds guests by name (one, or several separated by commas). Resolves to true when someone was added. */
  const addGuests = async (raw) => {
    const parsed = parseNames(raw, people);
    const rejected = describeRejected(parsed);
    if (rejected) notify.error('Not added, ' + rejected);
    if (!parsed.valid.length) {
      if (!rejected && raw.trim()) notify.warning('Enter a name to add');
      return false;
    }
    if (!await actions.addPeople(groupId, parsed.valid)) return false;
    actions.setSavedPeople((current) => [...current, ...parseNames(parsed.valid.join(','), current).valid]);
    notify.success(parsed.valid.length === 1 ? parsed.valid[0] + ' added as a guest' : parsed.valid.length + ' guests added');
    return true;
  };

  /** `self`: the owner taking their own person out of the expenses (they stay the owner, with access). */
  const removePerson = (name, { self = false } = {}) => {
    const status = removalStatus(name, balances, expenses, payments);
    if (status === 'blocked') {
      notify.warning(self
        ? 'You still owe or are owed money in this group. Settle up (record a payment) before removing yourself.'
        : name + ' still owes or is owed money in this group. Settle up (record a payment) before removing them.');
      return;
    }
    const remove = async () => {
      if (await actions.removePerson(groupId, name)) notify.info(self ? 'You are no longer in this group\'s expenses' : name + ' removed from this group');
    };
    if (status === 'free' && !self) { remove(); return; }
    modal.confirm({
      title: self ? 'Remove yourself from the expenses?' : 'Remove ' + name + '?',
      content: self
        ? 'You stay the owner and keep access. Your past expenses and payments stay in the group history, and you can add yourself again later.'
        : 'They are settled up. Their past expenses and payments stay in the group history.',
      okText: 'Remove',
      onOk: remove,
    });
  };

  const addExpense = () => {
    if (expenseForm.editingId !== null) expenseForm.reset(); // a closed edit never comes back as "Add"
    setExpenseOpen(true);
  };
  const editExpense = (id) => { if (expenseForm.edit(id)) setExpenseOpen(true); };
  // Closing keeps a half-typed new expense for next time, but never an edit.
  const closeExpense = () => {
    if (expenseForm.editingId !== null) expenseForm.reset();
    setExpenseOpen(false);
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
      totalCents,
      currencyCode,
    };
    if (await actions.saveSnapshot(groupId, snapshot)) notify.success('Split saved. Find it under Recent Activities.');
  };

  const exportCsv = () => {
    const rows = [['Group', 'Date', 'Category', 'Description', 'Paid by', 'Total (' + currencyCode + ')', 'Split details']];
    expenses.forEach((expense) => rows.push([
      group.name, expense.createdAt || '', expense.category || '', expense.description, expense.payer,
      // Numeric cells, as before the switch to cents, so spreadsheets can sum them.
      centsToDecimalNumber(expense.amountCents),
      Object.entries(expense.splitCents || {}).map(([name, cents]) => name + ': ' + formatMoney(cents)).join('; '),
    ]));
    rows.push([], ['Suggested settlements'], ...settlements.map((item) => [
      item.payer, 'pays', item.payee, centsToDecimalNumber(item.amountCents),
    ]));
    const safeName = group.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'group';
    downloadText(safeName + '-settlement.csv', 'text/csv;charset=utf-8', toCsv(rows));
  };

  const copySummary = async () => {
    const summary = settlements.length
      ? settlements.map((item) => item.payer + ' pays ' + item.payee + ' ' + formatMoney(item.amountCents)).join('\n')
      : 'Everyone is settled up.';
    try {
      await navigator.clipboard.writeText(group.name + '\n' + summary);
      notify.success('Settlement copied');
    } catch {
      notify.error('Clipboard access is unavailable');
    }
  };

  const hasPeople = people.length > 0;
  const nothingRecorded = !expenses.length && !payments.length;
  const toSettle = settlementSummary(settlements, me, formatMoney);

  return (
    <>
      <header className="group-header">
        <div className="group-heading">
          <h1 className="group-title">{group.name}</h1>
          <p className="group-subtitle">{groupSubtitle(group)}</p>
        </div>
        <div className="group-header-actions">
          <Tooltip title={group.cloud ? 'Accounts that can open and edit this group' : 'Sign in to share this group'}>
            <Button icon={<TeamOutlined />} onClick={() => setMembersOpen(true)}>Members</Button>
          </Tooltip>
          <Tooltip title="Group settings">
            <Button icon={<SettingOutlined />} aria-label="Group settings" onClick={() => setSettingsOpen(true)} />
          </Tooltip>
        </div>
      </header>

      {!group.cloud && <WelcomePanel guest />}

      {hasPeople && (
        <>
          <section aria-labelledby="group-summary-heading">
            <h2 id="group-summary-heading" className="visually-hidden">Summary</h2>
            <dl className="group-summary">
              <div className="summary-item">
                <dt>Group spend</dt>
                <dd><span className="summary-value">{formatMoney(totalCents)}</span></dd>
              </div>
              <div className="summary-item">
                <dt>Participants</dt>
                <dd>
                  <span className="summary-value">{people.length}</span>
                  <button type="button" className="summary-link" onClick={() => goTo('people-heading')}>View list</button>
                </dd>
              </div>
              <div className="summary-item summary-settle">
                <dt>To settle</dt>
                <dd>
                  <span className="summary-value summary-sentence">{toSettle.headline}</span>
                  <span className="summary-detail">{toSettle.detail}</span>
                  <button type="button" className="summary-link" onClick={() => { setTab('balances'); goTo('group-tabs'); }}>
                    View balances
                  </button>
                </dd>
              </div>
            </dl>
          </section>

          <div className="group-toolbar">
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={addExpense}>Add expense</Button>
            <div className="group-toolbar-secondary">
              <Tooltip title={nothingRecorded ? 'Add an expense or payment first' : 'Save a snapshot of this split'}>
                <Button type="text" icon={<SaveOutlined />} disabled={nothingRecorded} onClick={saveSplit}>Save split</Button>
              </Tooltip>
              <Button type="text" icon={<DownloadOutlined />} onClick={exportCsv}>Export CSV</Button>
            </div>
          </div>

          <GroupTabs
            activeTab={tab}
            onTabChange={setTab}
            expenses={expenses}
            payments={payments}
            balances={balances}
            settlements={settlements}
            formatMoney={formatMoney}
            onEditExpense={editExpense}
            onDeleteExpense={async (id) => {
              if (await actions.deleteExpense(groupId, id)) notify.success('Expense deleted');
            }}
            onDeletePayment={async (id) => {
              if (await actions.deletePayment(groupId, id)) notify.success('Payment removed');
            }}
            onAddExpense={addExpense}
            onCopySummary={copySummary}
            paymentForm={(
              <PaymentForm
                people={people}
                balances={balances}
                currencySymbol={symbol}
                onAddPayment={(payment) => actions.addPayment(groupId, payment)}
                notify={notify}
                modal={modal}
              />
            )}
          />
        </>
      )}

      <PeoplePanel group={group} onAddGuests={addGuests} onRemove={removePerson} />
      <footer className="page-footer"><SaveStatus cloud={group.cloud} realtime={realtime} /></footer>

      <Modal
        title={expenseForm.editingId !== null ? 'Edit expense' : 'Add an expense'}
        open={expenseOpen}
        onCancel={closeExpense}
        footer={null}
        width={720}
        forceRender
        className="expense-modal"
      >
        <div id="add-expense">
          <ExpenseForm
            expenseForm={expenseForm}
            people={people}
            currencySymbol={symbol}
            onCancelEdit={closeExpense}
          />
        </div>
      </Modal>
      <MembersModal group={group} open={membersOpen} onClose={() => setMembersOpen(false)} />
      <GroupSettingsModal group={group} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
