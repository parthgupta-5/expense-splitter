import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Button, Card, Col, Result, Row, Statistic, Tag, Tooltip,
} from 'antd';
import {
  CheckCircleFilled, CloudOutlined, SettingOutlined, ShareAltOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { useExpenseForm } from '../hooks/useExpenseForm';
import ActivityPanel from '../components/ActivityPanel';
import ExpenseForm from '../components/ExpenseForm';
import GroupSettingsModal from '../components/GroupSettingsModal';
import MembersModal from '../components/MembersModal';
import PageIntro from '../components/PageIntro';
import PaymentForm from '../components/PaymentForm';
import PeoplePanel from '../components/PeoplePanel';
import { toCsv } from '../lib/csv';
import { currencySymbol, formatCents } from '../lib/currency';
import { downloadText } from '../lib/download';
import { centsToDecimal, centsToDecimalNumber, sumCents } from '../lib/money';
import { describeRejected, parseNames, removalStatus } from '../lib/people';
import { computeBalances, computeSettlements } from '../lib/splits';
import { makeId, writeLastGroup } from '../lib/storage';

const EMPTY = [];

function SaveStatus({ cloud }) {
  return cloud
    ? <Tag bordered={false} icon={<CloudOutlined />} color="blue">Saved to your account · live updates on</Tag>
    : <Tag bordered={false} icon={<CheckCircleFilled />} color="success">Saved on this device</Tag>;
}

function useScrolled(threshold = 100) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

/** One group's page. `groupId` is the group's id (the route works out which group an address refers to). */
export default function GroupPage({ groupId }) {
  const {
    workspace, notify, modal,
  } = useApp();
  const { actions } = workspace;
  const group = workspace.groups.find((item) => item.id === groupId);
  const [nameValue, setNameValue] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isScrolled = useScrolled();

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

  const expenseForm = useExpenseForm({
    people, expenses, notify, onSave: (expense) => actions.saveExpense(groupId, expense),
  });

  useEffect(() => { if (group) writeLastGroup(group.id); }, [group]);

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
    modal.confirm({
      title: 'Remove ' + name + '?',
      content: 'They are settled up. Their past expenses and payments stay in the group history.',
      okText: 'Remove',
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
      totalCents,
      currencyCode,
    };
    if (await actions.saveSnapshot(groupId, snapshot)) notify.success('Split saved. Find it under History.');
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

  const shared = group.cloud && group.memberCount > 1;

  return (
    <>
      <PageIntro
        eyebrow="SHARED SPENDING"
        title={group.name}
        extra={(
          <>
            {shared && <Tag icon={<TeamOutlined />} color="purple">Shared · {group.memberCount} members</Tag>}
            <Tag>{group.currencyCode}</Tag>
            <Tooltip title={group.cloud ? 'Invite friends to edit this group' : 'Sign in to share this group'}>
              <Button size="small" icon={<ShareAltOutlined />} onClick={() => setMembersOpen(true)}>Share</Button>
            </Tooltip>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>Group settings</Button>
          </>
        )}
      />
      {people.length > 0 && (
        <Row gutter={[13, 13]} className={'stats-row ' + (isScrolled ? 'is-compact' : '')}>
          <Col xs={8}>
            <Card className="stat-card">
              <Statistic title="Group spend" value={centsToDecimal(totalCents)} precision={2} prefix={symbol} />
            </Card>
          </Col>
          <Col xs={8}><Card className="stat-card"><Statistic title="People" value={people.length} /></Card></Col>
          <Col xs={8}><Card className="stat-card"><Statistic title="To settle" value={settlements.length} /></Card></Col>
        </Row>
      )}
      <PeoplePanel
        groupName={group.name}
        people={people}
        value={nameValue}
        onChange={setNameValue}
        onAdd={addPeople}
        onRemove={removePerson}
      />
      {people.length > 0 && (
        <div className="feature-content">
          <section className="section-card" id="add-expense">
            <ExpenseForm expenseForm={expenseForm} people={people} currencySymbol={symbol} />
            <PaymentForm
              people={people}
              balances={balances}
              currencySymbol={symbol}
              onAddPayment={(payment) => actions.addPayment(groupId, payment)}
              notify={notify}
              modal={modal}
            />
          </section>
          <ActivityPanel
            expenses={expenses}
            payments={payments}
            balances={balances}
            settlements={settlements}
            formatMoney={formatMoney}
            onEditExpense={expenseForm.edit}
            onDeleteExpense={async (id) => {
              if (await actions.deleteExpense(groupId, id)) notify.success('Expense deleted');
            }}
            onDeletePayment={async (id) => {
              if (await actions.deletePayment(groupId, id)) notify.success('Payment removed');
            }}
            onSaveSplit={saveSplit}
            onExportCsv={exportCsv}
            onCopySummary={copySummary}
          />
        </div>
      )}
      <footer className="page-footer"><SaveStatus cloud={group.cloud} /></footer>
      <MembersModal group={group} open={membersOpen} onClose={() => setMembersOpen(false)} />
      <GroupSettingsModal group={group} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
