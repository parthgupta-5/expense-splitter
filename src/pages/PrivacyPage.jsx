import React from 'react';
import LegalPage from '../components/LegalPage';

// Keep every statement here true of the code and the database (see README, "Account deletion and data retention").
const sections = [
  {
    id: 'scope',
    title: 'What this policy covers',
    body: (
      <>
        <p>
          Expense Splitter is a web app for recording shared costs and working out who owes whom. It is a personal
          project run by its developer (Parth Gupta, for the original deployment). This page explains what the app
          does with your data.
        </p>
        <p>
          You can use the app <strong>without an account</strong>. Then everything you enter stays in your browser
          and is never sent to us. With an account, your groups are stored online so they sync across devices and can
          be shared.
        </p>
      </>
    ),
  },
  {
    id: 'data',
    title: 'What data the app handles',
    body: (
      <>
        <h3>Without an account</h3>
        <p>
          Groups, the names of people in them, expenses, payments, saved splits, names you reuse and your settings
          are kept only in this browser&apos;s storage on your device.
        </p>
        <h3>Your account</h3>
        <ul>
          <li>
            <strong>Sign-in details:</strong> your email address and password, handled by Supabase Auth (the app&apos;s
            own code never stores your password). If you choose Google sign-in, Google shares your name, email address
            and profile picture link with Supabase so you can sign in. Supabase also keeps sign-in records, such as when
            you last signed in, and your active sessions.
          </li>
          <li>
            <strong>Profile:</strong> your display name, your @username, your profile photo if you upload one, your
            default currency, small preferences (for example, that you closed the welcome panel) and names you reuse
            in groups.
          </li>
          <li>
            <strong>Friends:</strong> which accounts you sent a friend request to or received one from, whether it is
            pending, accepted or declined, and when.
          </li>
        </ul>
        <h3>Groups you are part of</h3>
        <ul>
          <li>The group&apos;s name and currency, who owns it, and which accounts are members.</li>
          <li>The people in the group: names typed by members, and which names are linked to an account.</li>
          <li>Expenses (description, amount, category, note, who paid and how it was split), payments between people,
            and saved splits (snapshots).</li>
          <li>Invitations: who invited which account, to be which person, and whether it is pending, accepted,
            declined, revoked or expired.</li>
          <li>An activity history of what happened in the group, with the display name of the member who did it.</li>
        </ul>
        <h3>Technical records</h3>
        <ul>
          <li>After you change your username, your previous one is held for you for 30 days.</li>
          <li>Counters that limit how often some actions can be repeated (to prevent abuse).</li>
          <li>One timestamp per account that tells the app to refresh your invitations live. It holds nothing else.</li>
          <li>
            In your browser, the app keeps your sign-in session, your appearance setting, the last group you opened and
            which notifications you have already seen. Signed-in group data is not saved on your device by the app.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'use',
    title: 'Why the data is used',
    body: (
      <ul>
        <li>To sign you in and keep you signed in.</li>
        <li>To decide who may see and change each group (access control).</li>
        <li>To let group members work together and see each other&apos;s changes as they happen.</li>
        <li>To calculate balances and suggest how to settle up.</li>
        <li>To show invitations and recent activity in your notifications.</li>
        <li>To limit abuse, such as too many invitations or username look-ups.</li>
        <li>To email you sign-up confirmation codes and password-reset codes. The app sends no other email.</li>
      </ul>
    ),
  },
  {
    id: 'not-used',
    title: 'What the app does not do',
    body: (
      <p>
        No advertising, no selling or renting of data, no analytics or tracking scripts, and no profiling. The app does
        not move money or take payments: it only does the maths.
      </p>
    ),
  },
  {
    id: 'visibility',
    title: 'Who can see what',
    body: (
      <ul>
        <li>
          <strong>Members of a group</strong> see its people, expenses, payments, saved splits and activity history,
          and each member&apos;s display name, @username and profile photo.
        </li>
        <li>
          <strong>Your friends</strong>, and anyone you send a friend request to or receive one from, see your display
          name, @username and profile photo. Nobody sees your email address.
        </li>
        <li>
          <strong>Someone you invite</strong> sees only the group&apos;s name, the name they would join as, and your
          display name and @username, until they accept. They see nothing else of the group unless they accept.
        </li>
        <li>
          <strong>A group&apos;s owner</strong> sees the @username and display name of each account they invited, and
          whether it accepted or declined.
        </li>
        <li>
          <strong>Finding people:</strong> a group owner can look up one exact @username (a limited number of times)
          to see that account&apos;s display name and profile photo before inviting it. Usernames cannot be browsed or
          listed.
        </li>
        <li>
          <strong>Email addresses are never shown to other users.</strong> Your username, display name and photo are
          public labels, so do not put your email address or other private details in them.
        </li>
        <li>
          <strong>Profile photos</strong> are stored under a random file name. Anyone who has a photo&apos;s exact link
          can view it, but nobody can list the photos.
        </li>
        <li>
          <strong>Guests</strong> are names that members type into a group. They have no account and receive nothing.
        </li>
      </ul>
    ),
  },
  {
    id: 'providers',
    title: 'Services the app relies on',
    body: (
      <>
        <ul>
          <li><strong>Supabase</strong> provides sign-in, the database, photo storage and live updates.</li>
          <li>
            <strong>Vercel</strong> hosts the website. Like most hosts, it may keep technical request logs (such as IP
            addresses and browser details).
          </li>
          <li>
            <strong>An email delivery (SMTP) service</strong>, set up in Supabase by the operator, sends the sign-up
            and password-reset codes.
          </li>
          <li><strong>Google</strong> is involved only if you choose &quot;Continue with Google&quot;.</li>
          <li>
            <strong>Google Fonts</strong> serves the app&apos;s fonts, so your browser contacts Google when pages load,
            which shows Google your IP address.
          </li>
        </ul>
        <p>Each of these handles data under its own terms and privacy policy.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How the data is protected',
    body: (
      <ul>
        <li>
          Access rules live in the database itself: only members can read a group, only its owner can rename or delete
          it or invite people, and only you can change your profile or photos.
        </li>
        <li>The app and Supabase are reached over HTTPS.</li>
        <li>Photos are re-encoded in your browser before upload, which removes hidden details such as location.</li>
        <li>No system is perfectly secure, and this is a project app: please do not store anything highly sensitive.</li>
      </ul>
    ),
  },
  {
    id: 'deletion',
    title: 'Deleting your account, and how long data is kept',
    body: (
      <>
        <p>
          Go to <strong>Settings → Delete account</strong> and type your @username. If you last signed in more than 15
          minutes ago, you will be asked to sign in again first.
        </p>
        <p>
          <strong>You have 7 days to change your mind.</strong> Your account is switched off straight away and deleted
          for good 7 days later. Sign in during those 7 days and you can restore it, with everything as it was (except
          the invitations and friend requests that were withdrawn).
        </p>
        <p>
          <strong>When deletion is blocked:</strong> if you own a group that other members use, delete that group first
          (Group settings → Delete group). Deleting it removes it for every member. Handing a group over to someone else
          is not available yet.
        </p>
        <h3>Straight away</h3>
        <ul>
          <li>You are signed out on every device.</li>
          <li>Nobody can find you by @username, invite you to a group or send you a friend request.</li>
          <li>
            Pending invitations to you, invitations sent from groups you own, and pending friend requests to or from you
            are withdrawn.
          </li>
        </ul>
        <h3>Deleted after 7 days</h3>
        <ul>
          <li>Your sign-in account (email address, password, Google link) and your sessions.</li>
          <li>Your profile: display name, @username, photo, preferences and friends. Your photo files are removed.</li>
          <li>Groups you own that nobody else uses, with all their expenses, payments, saved splits, invitations and history.</li>
          <li>Your memberships in other people&apos;s groups, and invitations sent to you.</li>
          <li>Your username hold, rate-limit counters and notification timestamp.</li>
        </ul>
        <h3>Kept in other people&apos;s groups</h3>
        <ul>
          <li>
            The name you appeared under and the expenses, payments and saved splits recorded there stay, because the
            other members&apos; balances depend on them. They are no longer linked to your account.
          </li>
          <li>In those groups&apos; activity history, your name is replaced by &quot;Former member&quot;.</li>
        </ul>
        <h3>Afterwards</h3>
        <ul>
          <li>Once your account is deleted, your @username becomes available for someone else to choose.</li>
          <li>
            The app makes no separate backups of its own. Supabase and Vercel may keep backups or logs for a limited
            time under their own policies; we cannot give a specific period.
          </li>
          <li>
            Data used without an account exists only in your browser: delete those groups, or clear this site&apos;s
            data in your browser settings.
          </li>
        </ul>
        <h3>While your account exists</h3>
        <p>
          Your data is kept until you change or delete it, or until the group it belongs to is deleted. Answered
          invitations are listed for 30 days. Leaving a group removes your access; your name stays in that group as a
          guest.
        </p>
      </>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices',
    body: (
      <ul>
        <li>Change your display name and photo at any time, and your username once every 30 days, in Settings.</li>
        <li>Leave groups, and delete groups you own.</li>
        <li>Download a backup of your groups as a file from Settings.</li>
        <li>Delete your account, as described above.</li>
      </ul>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and questions',
    body: (
      <p>
        If this policy changes, the date at the top changes too. For questions or requests, contact the person who
        runs this copy of Expense Splitter.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="In short: the app keeps what it needs to sign you in and to run your groups, shows it only to the people who share those groups, and never shows your email address to anyone."
      sections={sections}
      other={{ to: '/terms', label: 'Terms of Service' }}
    />
  );
}
