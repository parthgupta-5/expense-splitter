# Expense Splitter

Split shared costs with friends, flatmates or travel groups, share the group so everyone adds their own expenses, and
settle up with a plan of at most N−1 payments for N people.

> **End-term project submission**
>
> | | |
> |---|---|
> | Student | Parth Gupta |
> | Live app | https://expense-splitter-two-liart.vercel.app/ |
> | Repository | https://github.com/parthgupta-5/expense-splitter |
> | Demo video | https://drive.google.com/drive/folders/18WCMGBshCLx_oNikPugSDe6uieNrnyx3?usp=sharing |
> | Tech stack | React 19, Vite, Ant Design, Supabase (Postgres, Auth, Row Level Security, Realtime, Storage, Edge Functions), Vercel |

## Contents

1. [Try it in 5 minutes](#try-it-in-5-minutes)
2. [Problem statement](#problem-statement)
3. [Target users](#target-users)
4. [Solution](#solution)
5. [Key features and core workflows](#key-features-and-core-workflows)
6. [Tech stack](#tech-stack)
7. [Architecture](#architecture)
8. [Engineering decisions](#engineering-decisions)
9. [Security](#security)
10. [Error handling](#error-handling)
11. [Testing](#testing)
12. [Local setup](#local-setup)
13. [Environment variables](#environment-variables)
14. [Deployment](#deployment)
15. [Known limitations](#known-limitations)
16. [Project history](#project-history)
17. [AI usage](#ai-usage)
18. [Originality](#originality)

---

## Try it in 5 minutes

No account is needed for the first part.

1. Open the [live app](https://expense-splitter-two-liart.vercel.app/) and create a group (for example "Goa trip").
2. Add three people, then add expenses with different split types: equal, exact amounts, shares and percentages.
3. Open **Balances**: each person shows "Owes ₹…", "Is owed ₹…" or "Settled", with the shortest repayment plan.
   Record one payment and watch the plan shrink.
4. Sign up (email with a 6-digit code, or Google) and choose a @username. The app offers to move the group you made
   as a guest into your account.
5. To see sharing, use a second browser (or a private window) with a second account:
   - **Friends** → send a friend request to the other @username. The other account accepts it from the 🔔 bell.
   - On the Friends page, **Add to group** adds that friend to your group and sends the group invitation.
   - The friend accepts from the bell and the group opens. Expenses added in one browser appear in the other without
     a reload.
6. **Recent Activities** shows who did what across your groups. **Settings → Delete account** switches the account
   off and gives it 7 days to be restored by signing in again.

---

## Problem statement

Group spending (trips, rent, dinners) ends in awkward maths: who paid, who took part, who owes whom, and how many
transfers it takes to clear everything. Spreadsheets break on uneven splits, one person ends up doing all the data
entry, and most apps force an account before they are useful at all.

## Target users

Friends, flatmates, couples and travel groups who share costs and want a clear, fair settle-up plan. They can start
without signing up, and sign in when they want their groups on every device or shared with the rest of the group.

## Solution

A web app that is useful **without an account**, with an optional account for syncing and sharing:

- **Guest mode:** everything works at once and is saved in this browser. Nothing is sent to a server.
- **Signed in:** groups live in Postgres, sync across devices and can be **shared**. Each member adds their own
  expenses and payments, and sees everyone else's changes live.
- **People you split with** can be friends with accounts (connected by a friend request and a group invitation that
  they accept) or plain names ("guests") for people who will never sign up.
- **The settle-up engine** works in whole cents (paise), never loses a paisa to rounding, and produces a plan with
  at most N−1 payments.

---

## Key features and core workflows

The project is built around five workflows, each implemented end to end: UI, validation, database rules and tests.

### 1. Record and split expenses

- Several groups, each with its own currency.
- Pick who paid and who took part, then split **equally, by exact amounts, by shares or by percentages**.
- Every amount is stored as an integer number of cents. Splits use the largest-remainder method, so the parts always
  add up exactly to the total (₹100 split three ways is 33.34 + 33.33 + 33.33).
- Expenses can be edited and deleted. An old expense that names someone who has since been removed cannot be edited
  until they are added back, because editing would silently move their share onto everyone else.

### 2. See balances and settle up

- A live net balance per person in plain words ("Owes ₹150.00", "Is owed ₹300.00", "Settled").
- A suggested repayment plan of at most N−1 payments, which can be copied as text to share in a chat.
- Recording a repayment updates the plan. Paying more than is owed asks for confirmation.
- Someone who still owes or is owed money cannot be removed from the group.

### 3. Share a group with other people

- Whoever creates a group (signed in) is its first participant, so they can pay and split straight away.
- **Add by username** (owner only): looks up an exact @username, then adds that person to the expenses *and* sends a
  group invitation in one step. They can be included in expenses at once and get access when they accept.
- **Add guest:** just a name, with no account, invitation or email.
- Each person shows what they are (you, member, invitation pending, declined, expired, guest), and every answered
  invitation has a next step (Resend, Keep as guest, Remove).
- Only the owner renames the group, changes its currency, manages invitations or deletes the group. Members can leave.
- Changes from other members appear live, without a reload (Supabase Realtime).

### 4. Friends

- Send a friend request to an exact @username. It becomes a friendship only when the other person **accepts**.
- Requests are answered in the 🔔 bell or on the Friends page. After a decline, the sender can ask again after
  7 days. Sent requests can be cancelled and friends can be removed.
- **Add to group:** adds a friend to any group you own in one click, which sends them the group invitation.

### 5. Account lifecycle

- Sign-up by email and password confirmed with a 6-digit code, Google sign-in, password reset by emailed code, and a
  change-password option. Each account picks a unique @username and can upload a profile photo.
- Groups made as a guest can be moved into the account in one click when signing in.
- **Deleting an account has a 7-day safety window.** The account is switched off straight away: it is signed out
  everywhere, cannot be found, invited or befriended, and pending invitations and friend requests are withdrawn.
  Signing in within 7 days shows a **Restore my account** screen. After 7 days a scheduled job deletes it for good.

### Supporting features

- **🔔 Notifications:** the bell holds only what waits for an answer (group invitations and friend requests). Its
  count is how many are waiting.
- **Recent Activities:** a server-written log of who did what across your groups ("Asha added 'Dinner' · ₹1,200"),
  plus point-in-time **saved splits** (snapshots of a settle-up).
- **Backup and export:** JSON backup and restore with validation, and a per-group CSV export that is safe to open in
  spreadsheets.
- **Real URLs:** every page and group has its own address (`/groups/goa-trip`), so back, refresh and bookmarks work.
- **First-time guidance:** a dismissible welcome and empty states that say what to do next.
- **Light and dark theme**, a layout that works on phones, and keyboard and screen-reader support.
- **Privacy Policy and Terms** pages, linked from every page footer and the sign-up form.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19, React Router 7, Ant Design 6, Vite | Fast single-page app with accessible components and real URLs |
| Backend | Supabase: Postgres, Auth, Row Level Security, Realtime, Storage, SQL functions | Managed sign-in; authorisation and validation enforced inside the database, not just in the UI |
| Server code | Supabase Edge Functions (Deno) | The two tasks that need the admin key: switching an account off, and the daily final deletion |
| Hosting | Vercel (static site) | Free tier, redeploys on every push |
| Tests | Vitest, Testing Library, PGlite (Postgres in WebAssembly), Playwright | Money logic, screens, the real SQL security rules, and real browser flows |
| Quality | ESLint (with React Hooks rules), GitHub Actions CI, a secret scanner | Every pull request and push to `main` is linted, tested and built |

There is no custom backend server. The browser talks to Supabase directly with the public key and the signed-in
user's token, and **Postgres decides what each user may do**. This removes a whole layer to build, host and secure,
and it means a rule cannot be skipped by calling the API without the app.

---

## Architecture

```text
Browser (React SPA, served by Vercel)
 ├─ src/main.jsx               router + AppProvider (shared state) + error boundary
 ├─ src/App.jsx                layout and routes: /groups, /groups/:group, /activity, /friends, /settings, /profile,
 │                             /auth/callback, /reset-password, /privacy, /terms (+ the restore screen)
 ├─ src/pages/                 one component per route, loaded on demand
 ├─ src/components/            forms, lists, dialogs, the bell, the top bar
 ├─ src/state/
 │    AppContext.jsx           provides auth, workspace, invitations and friends to every page
 │    useAuth.js               Supabase session, email codes, Google sign-in, password reset
 │    useWorkspace.js          guest (localStorage) or signed-in (Supabase) data, optimistic updates, realtime
 │    workspaceReducer.js      pure state transitions (unit-tested)
 │    useInvitations.js        the user's group invitations, accept and decline
 │    useFriends.js            friends and friend requests, accept and decline
 │    useGroupPeople.js        each person's status in a group (member, invitation pending, guest)
 ├─ src/data/cloudRepo.js      every Supabase query and function call in one place
 └─ src/lib/                   pure logic: splits, balances, settlement, money, people, backup, CSV, storage
          │  HTTPS (public key + user token)          ▲ Realtime (websocket, filtered by Row Level Security)
          ▼                                           │
Supabase
 ├─ Auth           email + 6-digit codes, Google (PKCE)
 ├─ Postgres       normalised tables, Row Level Security on every table, validation triggers,
 │                 security-definer functions for every multi-step action, an activity log written by triggers
 ├─ Realtime       activity rows and a per-user "something changed" signal for invitations and friend requests
 ├─ Storage        `avatars` bucket; each user writes only their own folder
 └─ Edge Functions `delete-account` (switch an account off, restorable for 7 days)
                   `purge-deleted-accounts` (run daily by a cron job: final deletion after 7 days)
```

### How a request flows: sharing a group

```text
Owner types @priya ─► add_person_by_username()  ── one transaction ──► person row + pending invitation
                                                                      └► signal row for Priya changes
Priya's app (Realtime) ─► re-reads list_my_invitations() ─► bell shows "Owner invited you to join Goa trip"
Priya clicks Accept ─► accept_invitation() ── checks it is hers, pending, not expired ──► links her account to
                                                                                         that person + membership
Every later change ─► trigger writes activity_log ─► Realtime delivers it only to members ─► their screens refresh
```

### Database design

| Table | Purpose |
|---|---|
| `groups` | Name, currency, owner (`created_by`, locked after insert) |
| `group_members` | Which **accounts** can open a group (`owner` or `member`) |
| `group_people` | The **names** in the split (people do not need an account); unique per group, ignoring case. `user_id` links a person to an account, set only by the owner linking themselves or by accepting an invitation |
| `expenses` | Amount in `bigint` cents, payer, split type, per-person shares (`{name: cents}`) |
| `payments` | Repayments between two different people, in cents |
| `saved_splits` | Read-only settle-up snapshots |
| `activity_log` | Who did what, written only by triggers |
| `group_invitations` | Pending and answered invitations (group, person, invited account, status, expiry); reachable only through functions |
| `friendships` | One row per pair of accounts: `pending`, `accepted` or `declined`; reachable only through functions |
| `invitation_updates` | One timestamp per account, bumped when an invitation or friend request involving it changes; the app listens to its own row to refresh |
| `profiles` | Each account's display name, unique @username, photo link, preferences and `deletion_requested_at` (set while the account waits to be deleted) |

### Who may do what (enforced by Postgres, tested in `supabase/tests/`)

| Action | Who is allowed |
|---|---|
| Read a group and its expenses, payments, people and log | Members of that group |
| Add or edit expenses, payments and guests | Members |
| Rename a group, change its currency, delete it | Its owner |
| Add by username, resend, revoke, keep as guest, remove members | Its owner |
| Accept or decline a group invitation | Only the account it was sent to |
| Send a friend request; cancel your own request; remove a friend | The signed-in user, for themselves |
| Accept or decline a friend request | Only the account it was sent to |
| Link an account to a person | Nobody directly: only by accepting an invitation (or the owner linking themselves) |
| Write the activity log, add members directly, read `friendships` or `group_invitations` | Nobody (triggers and functions only) |
| Read or change a profile; upload a photo | Only its owner (photos only in their own folder) |
| Switch an account off for deletion | Only that account, through `delete-account`, after a recent sign-in and typing its @username |
| Restore a switched-off account | Only that account, within 7 days |
| Delete an account for good | Only the scheduled `purge-deleted-accounts` job, after the 7 days |
| Anything at all | Not anonymous visitors |

---

## Engineering decisions

- **Money is integer cents everywhere.** In the app, in backups and in `bigint` columns. Splits use the
  largest-remainder method, so shares always add up exactly. Decimals exist only for display.
- **Validation lives in the database as well as the UI.** A trigger rejects an expense whose shares do not add up to
  the total, whose payer or participants are not in the group, or whose shares are not whole cents. The UI checks
  first so the message is friendly; the database is the guarantee, even for a hand-made API call.
- **The SQL and JavaScript balance maths are tested against each other.** `group_balances()` in SQL is compared with
  `computeBalances()` in JavaScript on randomly generated groups.
- **One row per change.** An early version stored each group as one JSON document, so two people editing at once
  overwrote each other. Now every expense, payment and person is its own row, so edits to different expenses never
  conflict.
- **Optimistic updates with honest rollback.** The screen updates immediately. If the database rejects the write, the
  user sees why and the group is re-read from the server.
- **Multi-step actions are single transactions.** Adding someone by username creates the person and the invitation
  together (or neither). Accepting an invitation links the account and creates the membership together.
- **One realtime channel.** Every change writes an activity row, and Realtime only delivers rows the user may read, so
  one subscription covers expenses, payments, people, members and renames. Invitations and friend requests reach
  someone who is not a member yet through their own `invitation_updates` row, which holds only a timestamp.
- **The bell is only for decisions.** It lists what needs an answer, and its count only goes down when something is
  answered. History lives on its own Recent Activities page, so nothing is shown twice.
- **Friendship needs consent.** A request is not a friendship until it is accepted, a decline blocks repeat requests
  for 7 days, and friend requests are rate limited.
- **Deletion is reversible for 7 days.** The account is switched off at once (so it disappears for everyone else
  immediately) but kept, so a mistake or a stolen session can be undone. Only a scheduled server job, protected by a
  secret, deletes it for good.
- **Guest mode by design.** With no session, data stays in `localStorage` and the database is never called. The
  database refuses anonymous requests anyway (every policy is written `to authenticated`).
- **Code splitting.** Pages and dialogs load on demand; React and Supabase are separate long-cached files.

---

## Security

- **No secrets in the repository or the browser.** The app uses only Supabase's public key; access is decided by Row
  Level Security. The `service_role` (admin) key exists only inside the two Edge Functions, read from the environment
  Supabase provides. The daily purge function also requires a `CRON_SECRET` header, so nobody else can trigger it.
  `scripts/check-secrets.mjs` runs in CI and fails on anything that looks like a key or a tracked `.env` file.
- **Sign-in:** PKCE flow with a single `/auth/callback` route, and codes are removed from the address bar at once.
  Passwords need 12+ characters with mixed character types.
- **Sensitive actions need a fresh sign-in.** Deleting an account requires a sign-in from the last 15 minutes and
  typing your own @username.
- **Privacy:** members, friends and people who look you up see your display name, @username and photo, never your
  email address. Usernames can only be looked up by exact match, never listed or searched.
- **Abuse limits (in the database):** username checks, look-ups, changes, group invitations and friend requests are
  rate limited per account; a group can have at most 20 pending invitations; a user at most 50 pending friend requests.
- **Photos:** checked by their bytes, re-encoded to a 512 x 512 JPEG in the browser (removing EXIF and GPS data) and
  stored under a random name. The bucket accepts only small JPEGs.
- **Browser hardening:** `vercel.json` sends a Content-Security-Policy (only this site, Google Fonts and
  `*.supabase.co`), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive permissions policy.
- **Every schema change has a migration and a tested rollback script** (`supabase/migrations/`,
  `supabase/rollbacks/`).

---

## Error handling

- **Invalid input:** splits that do not add up, duplicate or over-long names, paying yourself, bad usernames and
  malformed money amounts are refused with a clear message, and the database refuses them again if the UI is bypassed.
- **Failed network requests and database errors:** mapped to plain-language messages (`src/lib/errors.js`). A failed
  write rolls the screen back to what the server has.
- **Unauthorised actions:** buttons are hidden for actions the user may not take, and the database refuses them anyway
  with a message the app shows.
- **Missing resources:** unknown pages and deleted groups show a 404 page with a way back; an error boundary prevents
  a blank screen.
- **Duplicate operations:** inviting someone twice, re-sending a friend request, or answering something already
  answered each get a specific explanation. Accepting an invitation is safe to retry.
- **Expired or withdrawn items:** expired or revoked invitations, expired email codes and sign-in links, and a
  cancelled Google sign-in each get their own message.
- **Uploads and files:** unsupported or oversized photos are refused before upload. Damaged or hand-edited backup
  files are checked, and skipped items are reported.
- **Realtime down:** the app keeps working and refreshes when the tab becomes visible again.
- **Loading, empty, success and error states** exist on every list and dialog.

---

## Testing

| Suite | What it covers | Command |
|---|---|---|
| Unit | Split, balance and settlement maths (exact cents, random property tests), money input parsing, name and username rules, CSV escaping, backup and storage checks, reducer transitions, photo checks, sign-in redirects | `npm run test:unit` |
| App (jsdom) | Real screens with a mocked data layer: routing and group addresses, adding people and expenses, the settle-up summary, sign-in screens, Settings, the participants list, invitations and friend requests in the bell, Recent Activities, onboarding and empty states, account deletion and restoring | `npm run test:unit` |
| Database (PGlite) | The real SQL migrations running in Postgres compiled to WebAssembly, acting as different users: Row Level Security isolation, anonymous access denied, validation triggers, sharing rules, invitations, friend requests, the 7-day deletion window, account deletion cleanup, Storage policies, rate limits, rollback scripts, SQL balances equal JavaScript balances; plus both Edge Functions with fake clients | `npm run test:db` |
| Browser (Playwright) | The production build in Chromium on desktop and phone sizes: the full guest flow, persistence after reload, every URL, money input rules, photo handling, keyboard use, policy pages, no console errors, no sideways scrolling | `npm run test:e2e` |

CI (`.github/workflows/ci.yml`) runs the secret scan, lint, the unit and database tests, the build and the Playwright
browser tests on every pull request and push to `main`. Not automated: real email delivery, Supabase Realtime itself, and the deployed Edge Functions, which
are checked by hand with the [checklist](#4-check-the-live-app) below.

---

## Local setup

Requires Node 20.19+ or 22.12+.

```bash
git clone https://github.com/parthgupta-5/expense-splitter.git
cd expense-splitter
npm install
cp .env.example .env      # optional: without it the app runs in guest mode only
npm run dev               # http://localhost:5173
```

Other commands:

```bash
npm test                  # every Vitest suite (unit, app, database)
npm run test:unit         # only the tests in src/
npm run test:db           # only the database tests (no Supabase project needed)
npm run test:e2e          # browser tests (first time: npx playwright install chromium)
npm run lint
npm run build             # production build in dist/
npm run preflight         # lint + tests + build + secret scan, run before pushing
```

---

## Environment variables

**Browser app** (Vercel and `.env`). Both are public by design; Row Level Security enforces access.

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | The bare project URL, `https://<project-ref>.supabase.co` (not the `/rest/v1/` address) |
| `VITE_SUPABASE_ANON_KEY` | The project's anon / publishable key |

**Edge Functions** (Supabase only, never in Vercel, `.env` or the repository).

| Variable | Set by | Used by |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase, automatically | Both functions |
| `CRON_SECRET` | You (a long random string, e.g. `openssl rand -hex 32`) | `purge-deleted-accounts` |
| `ALLOWED_ORIGINS` (optional) | You | `delete-account`, to limit which sites may call it |

`.env` is git-ignored. Vite builds `VITE_*` values into the app, so redeploy after changing them, and never put the
`service_role` key in a `VITE_*` variable.

---

## Deployment

The live app runs on **Vercel** (frontend) and **Supabase** (database, sign-in, functions):
https://expense-splitter-two-liart.vercel.app/

To deploy your own copy from scratch:

### 1. Supabase project and database

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor:** run these files **in this order**. Each one is safe to run again, so an existing project can
   simply run the whole list.
   1. `supabase/migrations/2026102201_expense_splitter_core.sql`
   2. `supabase/migrations/2026102601_harden_groups.sql`
   3. `supabase/migrations/2026102701_normalize_and_share.sql`
   4. `supabase/migrations/2026102801_import_checks_split_total.sql`
   5. `supabase/migrations/2026102901_profiles_usernames.sql`
   6. `supabase/migrations/2026103001_avatar_storage.sql`
   7. `supabase/migrations/2026103101_username_invitations.sql`
   8. `supabase/migrations/2026110101_people_invites_account_deletion.sql`
   9. `supabase/migrations/2026110201_friends_and_account_recovery.sql`
3. **Project Settings → API:** copy the Project URL and the anon / publishable key.
4. **Authentication → Providers → Email:** turn on **Confirm email**, set **Email OTP length** to 6, the minimum
   password length to 12 and require lowercase, uppercase, digits and symbols. Put `{{ .Token }}` in the **Confirm
   signup** and **Reset password** email templates (editing templates needs custom SMTP, such as Brevo or Resend).
5. **Authentication → Providers → Google** (optional): add the Client ID and Secret of a Google Cloud OAuth *Web
   application* client. Its redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
6. **Authentication → URL Configuration:** set **Site URL** to the Vercel URL, and add
   `https://<your-app>.vercel.app/auth/callback` and `http://localhost:5173/auth/callback` to **Redirect URLs**.

### 2. Edge Functions and the daily job

1. Deploy both functions with the Supabase CLI:
   ```bash
   npx supabase login
   npx supabase functions deploy delete-account --project-ref <project-ref>
   npx supabase functions deploy purge-deleted-accounts --no-verify-jwt --project-ref <project-ref>
   ```
   (Or Dashboard → Edge Functions → Deploy a new function, pasting each function's `handler.js` and `index.ts`.)
2. Add the secret the purge job needs:
   `npx supabase secrets set CRON_SECRET=<a long random string> --project-ref <project-ref>`
   (or Dashboard → Edge Functions → Secrets).
3. Schedule the purge once a day. Turn on the **pg_cron** and **pg_net** extensions (Database → Extensions), then run
   this in the SQL Editor:
   ```sql
   select cron.schedule('purge-deleted-accounts', '15 3 * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/purge-deleted-accounts',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<your CRON_SECRET>'),
       body := '{}'::jsonb
     );
   $$);
   ```
4. Check it: `curl -X POST https://<project-ref>.supabase.co/functions/v1/purge-deleted-accounts -H "x-cron-secret: <your CRON_SECRET>"`
   should answer `{"deleted":0,"failed":[]}`.
5. If `delete-account` answers `401 Invalid JWT` for signed-in users, redeploy it with `--no-verify-jwt`; the function
   still checks the user's token itself.

### 3. Vercel

1. Add New → Project, import the GitHub repository (framework preset **Vite**).
2. Environment Variables (Production, Preview, Development): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` sends every path to `index.html` (so `/groups/goa-trip` survives a refresh), sets the
   security headers, and caches hashed files for a year.

### 4. Check the live app

Use two browsers with two accounts.

- [ ] As a guest: create a group, add people and an expense of each split type; balances and the plan are correct.
- [ ] Sign up; the "Keep the groups from this device?" dialog moves the guest group into the account.
- [ ] Send a friend request; the other account's bell shows it with a count, and accepting makes you friends.
- [ ] Friends → Add to group; the friend's bell shows the group invitation; accepting opens the group.
- [ ] An expense added in one browser appears in the other without a reload, and in Recent Activities.
- [ ] The second account cannot rename, delete or invite people to the owner's group, and can leave it.
- [ ] Password reset emails a 6-digit code; refreshing any page does not show a 404.
- [ ] Settings → Delete account on a throwaway account: it is signed out; signing in shows the restore screen;
      Restore brings everything back.
- [ ] `/privacy` and `/terms` open without signing in. No errors in the browser console.

---

## Known limitations

- **Adding by username needs an existing account.** There are no invitation emails: a friend signs up first, or is
  added as a guest meanwhile.
- **No ownership transfer.** An owner whose group other members use must delete that group before deleting their
  account.
- **People are referenced by name in expenses.** Deleting an old expense or payment that names a removed person can
  leave that person with a balance until they are added back.
- **Same-expense edits are last-writer-wins.** If two members edit the *same* expense at the same moment, the later
  save wins. Different expenses never conflict.
- **A switched-off account is locked by the app, not by every database rule.** It cannot be found, invited or
  befriended (enforced by the database), and the app shows only the restore screen. Its group memberships stay until
  the final deletion so a restore can bring them back, which means its owner could still reach those groups by calling
  the API directly during the 7 days.
- **Signed-in changes need a connection.** Offline writes are refused with a message rather than queued.
- **No currency conversion.** Each group has one currency.
- **Guest data lives only in the browser** until it is moved into an account or backed up.
- **No notifications outside the app** (no push or email notifications).
- Free-tier Supabase projects pause after a period of inactivity.

---

## Project history

- **v1:** React app with guest mode and per-user cloud sync of whole groups as JSON; tests for the money logic; CI.
- **v2:** normalised database (one row per expense, payment and person), group sharing with roles, server-side
  validation and activity log, Realtime updates, per-group currency, real URLs, password reset, code splitting, and
  database and browser test suites. Two v1 bugs were found and fixed along the way (a wrong Supabase URL format that
  broke sign-in, and a read policy that rejected creating a brand-new group).
- **Accounts and sharing:** unique @usernames, email codes, Google sign-in, profile photos, invitations by @username
  with accept and decline, the creator as a participant from the start, guests and clear person statuses.
- **Product clean-up:** a review found features shown twice and removed the duplication. The bell now holds only
  what needs an answer, and history moved to its own Recent Activities page. A plain "saved names" list was replaced by
  real **friends with requests**, and account deletion gained a **7-day restore window** with a scheduled final
  deletion.

## AI usage

AI tools (Claude) were used for reviewing the product, debugging, refactoring, writing tests and documentation. Every
change was reviewed by the author, who is responsible for the final product and its design decisions.

## Originality

An original project built with open-source libraries (React, React Router, Ant Design, the Supabase client, Vite). No
existing application or tutorial project was forked.
