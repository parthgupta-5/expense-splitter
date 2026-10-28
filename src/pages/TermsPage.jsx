import React from 'react';
import { Link } from 'react-router';
import LegalPage from '../components/LegalPage';

const sections = [
  {
    id: 'service',
    title: 'What Expense Splitter is',
    body: (
      <p>
        A free web app for recording shared expenses and working out who owes whom. It does not move money, take
        payments or hold funds: paying each other back happens outside the app. It is a project (an MVP) run by its
        developer, not a commercial service.
      </p>
    ),
  },
  {
    id: 'as-is',
    title: 'Using it as it is',
    body: (
      <p>
        The app is provided as it is, without guarantees. Features may change or stop, and it may sometimes be
        unavailable (for example, the free hosting it uses can pause when idle). Keep a backup (Settings → Download
        backup) of anything you cannot afford to lose.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul>
        <li>An account is optional. If you create one, use your own email address and keep your password safe.</li>
        <li>One person per account. You are responsible for what is done with your account.</li>
        <li>
          Choose a display name, @username and photo that do not pretend to be someone else, are not offensive, and do
          not contain your email address. A chosen username can be changed once every 30 days.
        </li>
      </ul>
    ),
  },
  {
    id: 'groups',
    title: 'Groups and what you enter',
    body: (
      <ul>
        <li>You are responsible for the expenses, names and notes you enter. Check the amounts: the app does the maths
          in whole cents, but it cannot know whether what you typed is right.</li>
        <li>
          A group&apos;s owner can rename it, change its currency, invite and remove members, and delete it for
          everyone. Members can add and edit expenses and payments, add guests, and leave.
        </li>
        <li>Only add other people (as guests or by username) and photos where you have a fair reason to.</li>
        <li>The app does not settle disagreements between group members.</li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Please do not',
    body: (
      <ul>
        <li>Use the app for anything illegal, or to harass anyone (including with unwanted invitations).</li>
        <li>Try to see or change data that is not yours, get around the limits, or probe for usernames in bulk.</li>
        <li>Disrupt the service or overload it with automated requests.</li>
      </ul>
    ),
  },
  {
    id: 'ending',
    title: 'Ending your use',
    body: (
      <>
        <p>
          You can stop using the app at any time and delete your account from Settings. If you own groups that other
          members use, you need to delete those groups first. What is deleted and what stays is described in the{' '}
          <Link to="/privacy#deletion">Privacy Policy</Link>.
        </p>
        <p>
          The person running the app may remove accounts or content that break these terms, or stop running the app.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Responsibility',
    body: (
      <p>
        As far as the law allows, the developer is not responsible for losses that come from using the app, such as a
        mistaken calculation, lost data or the app being unavailable. This page is written in plain language for a
        project app and is not legal advice.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and questions',
    body: (
      <p>
        If these terms change, the date at the top changes too. For questions, contact the person who runs this copy of
        Expense Splitter.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="In short: use the app fairly, check your numbers, and remember it is a free project provided as it is."
      sections={sections}
      other={{ to: '/privacy', label: 'Privacy Policy' }}
    />
  );
}
