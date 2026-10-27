# Expense Splitter

Split shared costs with friends, flatmates or travel groups, share the group so everyone can add expenses, and
settle up with the fewest possible payments.

> **Links**
>
> - Author: Parth Gupta
> - Repository: https://github.com/parthgupta-5/expense-splitter
> - Live app: TODO (Vercel URL)
> - Demo video: TODO (video link)

## Problem statement

Group spending (trips, rent, dinners) ends in awkward maths: who paid, who took part, who owes whom, and how many
transfers it takes to clear everything. Spreadsheets break on uneven splits, one person ends up doing all the data
entry, and most apps force an account before they are useful.

## Target users

Friends, flatmates, couples and travel groups who share costs and want a clear, fair settle-up plan. They can start
without signing up, and sign in when they want their groups on every device or shared with the group.

## Solution

A **local-first** web app with an optional account:

- **Guest mode (no sign-up):** everything works immediately and is saved in this browser.
- **Signed in:** groups live in Postgres (Supabase), sync across devices, and can be **shared**: invited members add
  expenses and payments themselves and see each other's changes live.
- The settle-up engine nets every balance in integer cents and produces a plan with at most N-1 payments.

## Key features

1. **Groups, people and currencies.** Several groups, each with its own currency, and a reusable list of saved people.
   Names are trimmed and de-duplicated (case-insensitive).
2. **Expenses.** Pick who paid and who took part, then split **equally, by custom amounts, by shares or by
   percentages**. Splits use the largest-remainder method in whole cents, so the parts always add up exactly to the
   total. Expenses can be edited and deleted.
3. **Balances and settling up.** Live net balance per person and a suggested repayment plan. Recording a repayment
   larger than what is owed asks for confirmation. Someone who still owes or is owed money cannot be removed.
4. **Sharing.** The owner invites friends by the email they signed up with. Members can add expenses and payments, or
   leave the group. Changes from other members appear within a second (Supabase Realtime).
5. **Activity history.** For signed-in users, a server-written log of who did what ("Asha added 'Dinner' · ₹1,200").
   Point-in-time **saved splits** (snapshots) can be viewed later.
6. **Accounts.** Email sign-up and sign-in, password reset by email, profile name and avatar. Groups made before
   signing in can be moved into the account in one click.
7. **Backup and export.** JSON backup and restore with validation, and CSV export that is safe to open in spreadsheets.
8. **Proper URLs.** Every page and every group has its own address, so the back button, refresh and bookmarks work.

## How using the app without signing up works

This is a deliberate design choice (local-first), not a gap in security:

1. **Guests' data never leaves the browser.** `src/state/useWorkspace.js` loads guest data from `localStorage`
   (`readGuestState()` in `src/lib/storage.js`) and saves it back after every change (`writeGuestState()`). No account
   is needed because nothing is sent to a server.
2. **The cloud is only used with a session.** `useAuth()` asks Supabase for the current session. With no session the
   workspace stays in `guest` mode and never calls the database.
3. **The database refuses guests anyway.** Every table has Row Level Security policies written `to authenticated`, so
   a request without a valid login token is rejected by Postgres itself. The database tests prove this
   (`supabase/tests/database.test.js`, "gives anonymous visitors no access at all").
4. **Trade-off:** guest data exists only in that browser. It is lost if site data is cleared, which is why the app
   offers backups and moves guest groups into an account when the user signs in.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19, React Router 7, Ant Design 6, Vite | Fast SPA with accessible components and real URLs |
| Backend | Supabase: Postgres, Auth, Row Level Security, Realtime, SQL functions | Managed auth; authorisation and validation enforced in the database |
| Hosting | Vercel (static SPA) | Free tier, redeploys on every push |
| Tests | Vitest, Testing Library, PGlite (Postgres in WebAssembly), Playwright | Money logic, data layer, security policies and real browser flows |
| Quality | ESLint (incl. React Hooks rules), GitHub Actions CI, secret scan | Every push is linted, tested and built |

## Architecture

```text
Browser (React SPA on Vercel)
 ├─ src/main.jsx                 BrowserRouter + AppProvider (context) + error boundary
 ├─ src/App.jsx                  layout and routes: /groups/:groupId, /groups, /history, /people, /settings, /profile
 ├─ src/pages/                   one component per route (lazy-loaded)
 ├─ src/components/              forms, tables, dialogs (members, group settings, auth, import)
 ├─ src/state/
 │    AppContext.jsx             provides auth + workspace + notifications to every page (no prop drilling)
 │    useAuth.js                 Supabase session, sign-up/in/out, password reset
 │    useWorkspace.js            guest (localStorage) or signed-in (Supabase) data, optimistic updates, realtime
 │    workspaceReducer.js        pure state transitions (unit-tested)
 ├─ src/data/
 │    cloudRepo.js               every Supabase query and RPC in one place
 │    mappers.js                 app objects <-> database rows (currency units <-> integer cents)
 └─ src/lib/                     pure, unit-tested logic: splits, people, backup, csv, storage, currency, activity
          │  HTTPS (anon key + user JWT)          ▲ Realtime (websocket, RLS-filtered)
          ▼                                       │
Supabase Postgres
 ├─ tables: profiles, groups, group_members, group_people, expenses, payments, saved_splits, activity_log
 ├─ Row Level Security on every table (members only)
 ├─ triggers: validate expenses/payments, block removing people with open balances, write the activity log
 └─ functions: invite_member, list_members, remove_member, import_group, group_balances
```

### Database design

| Table | Purpose |
|---|---|
| `groups` | Name, currency, owner (`created_by`, locked after insert) |
| `group_members` | Which **accounts** can access a group (`owner` or `member`) |
| `group_people` | The **names** in the split (friends do not need an account); unique per group, case-insensitive |
| `expenses` | Amount in `bigint` cents, payer, split type, per-person shares (`{name: cents}`) |
| `payments` | Repayments between two different people, in cents |
| `saved_splits` | Read-only snapshots, stored as JSON documents |
| `activity_log` | Who did what, written only by triggers |

### Security model (enforced by Postgres, tested in `supabase/tests/database.test.js`)

| Action | Who is allowed |
|---|---|
| Read a group and its expenses, payments, people, log | Members of that group |
| Add or edit expenses, payments, people; rename a group | Members |
| Delete a group | Its owner |
| Invite or remove members | Its owner (`invite_member`, `remove_member`) |
| Leave a group | Any member except the owner |
| Write the activity log, add members directly | Nobody (triggers and security-definer functions only) |
| Anything at all | Not anonymous visitors |

### Key decisions

- **Validation lives in the database as well as the UI.** A trigger rejects an expense whose shares do not add up
  to the total, whose payer or participants are not in the group, or whose shares are not whole cents (including when a guest group is imported into an account). The UI checks
  first for a friendly message; the database is the guarantee, even for a hand-crafted API call.
- **One row per expense.** v1 stored each group as one JSON blob, so two people editing the same group overwrote each
  other. v2 writes one row per change, so simultaneous edits to different expenses never conflict.
- **Optimistic updates with honest rollback.** The screen updates immediately; if the database rejects the write, the
  user sees why and the group is re-read from the server.
- **One realtime channel.** Every change writes an activity row, and Realtime only delivers rows the user may read,
  so listening to `activity_log` covers expenses, payments, people, members and renames.
- **The SQL and JavaScript balance maths agree.** `group_balances()` in SQL is property-tested against
  `computeBalances()` in JavaScript on random groups.
- **Code splitting.** Pages and dialogs load on demand; React and Supabase are separate long-cached chunks.

## Local setup

Requires Node 20.19+ or 22.12+.

```bash
npm install
cp .env.example .env      # optional: without it the app runs in guest mode only
npm run dev               # http://localhost:5173
npm test                  # unit, component, app and database tests
npm run test:e2e          # browser tests (first time: npx playwright install chromium)
npm run lint
npm run preflight         # lint + tests + build + secret scan + placeholder check (run before pushing)
```

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel and `.env` | No. Use the bare project URL `https://<ref>.supabase.co`, not `.../rest/v1/` |
| `VITE_SUPABASE_ANON_KEY` | Vercel and `.env` | No (public; Row Level Security enforces access) |

No server-side secrets are used. Never put the `service_role` key anywhere in this project. `.env` is git-ignored.
Vite bakes `VITE_*` values in at build time, so redeploy after changing them.

## Deployment (GitHub, Supabase, Vercel)

### 1. Supabase

1. Create a project at supabase.com.
2. SQL Editor: run these files **in this order** (each is safe to re-run):
   1. `supabase/migrations/2026102201_expense_splitter_core.sql`
   2. `supabase/migrations/2026102601_harden_groups.sql`
   3. `supabase/migrations/2026102701_normalize_and_share.sql`
   4. `supabase/migrations/2026102801_import_checks_split_total.sql`
3. Project Settings → API: copy the **Project URL** and the **anon / publishable key**.
4. Authentication → Providers: enable **Email**. For a smooth demo you may turn off "Confirm email" (Supabase's
   built-in email sender is heavily rate-limited); for real use keep it on.
5. Authentication → URL Configuration: set **Site URL** to the Vercel URL and add `https://<your-app>.vercel.app/**`
   and `http://localhost:5173/**` to **Redirect URLs** (needed for email confirmation and password reset).

**Upgrading an existing v1 project:** run migrations 3 and 4. It moves every group's old JSON data into the new
tables inside one transaction, then drops the old column. Migration 4 makes group import enforce the same
"shares add up to the total" rule as normal writes. The database tests include this upgrade path.

### 2. Vercel

1. Add New → Project, import the GitHub repo (framework preset **Vite**).
2. Environment Variables (Production, Preview, Development): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` rewrites all paths to `index.html` (so `/groups/<id>` survives a refresh), sets security
   headers including a Content-Security-Policy that allows only this site, Google Fonts and `*.supabase.co`
   (HTTPS and WebSocket for Realtime), and caches hashed assets for a year.

### 3. Verify the live app (two browsers)

- [ ] As a guest: create a group, add people, add an expense of each split type; balances and the plan are correct.
- [ ] Sign up; the "Keep the groups from this device?" dialog moves the guest group into the account.
- [ ] Share the group with a second account; in the second browser the group appears, and an expense added there
      shows up in the first browser within a second.
- [ ] The second account cannot invite people or delete the group, and can leave it.
- [ ] Password reset email opens `/reset-password`; refreshing any page does not 404.
- [ ] No console errors (including Content-Security-Policy violations).

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sign-in fails with a 404 or "Invalid path" | `VITE_SUPABASE_URL` ends in `/rest/v1/`; use the bare project URL (the app also trims it) |
| Only guest mode is offered | Env vars missing at build time: add them in Vercel, redeploy |
| `relation "public.expenses" does not exist` | Migration 3 has not been run |
| Invited friend sees "No account uses that email" | They must sign up first, with that exact email |
| Changes from others appear only after switching tabs | Realtime blocked (check CSP `wss://*.supabase.co`) or the Realtime service is paused |
| Email links open localhost | Supabase Site URL / Redirect URLs still point to localhost |

## Testing

| Suite | What it proves | Command |
|---|---|---|
| Unit (Vitest) | Split, balance and settlement maths (exact cents, random property tests), name rules, CSV escaping, backup and storage sanitising, cents mapping, reducer transitions, activity text | `npm run test:unit` |
| Hook (Vitest + mocked API) | Optimistic updates, rollback with an error message when the server rejects a write, live refresh, guest-to-account import, account data never written to the device | `npm run test:unit` |
| App (Vitest + jsdom) | Routing, adding people and an expense, settlement shown, 404 pages | `npm run test:unit` |
| Database (PGlite) | The real migrations: RLS isolation between users, anonymous access denied, validation triggers, sharing rules, activity log, v1 data upgrade, SQL balances equal JS balances | `npm run test:db` |
| Browser (Playwright) | Full guest flow in Chromium on desktop and a phone viewport, persistence after reload, per-group currency, every URL loads, no console errors, no sideways scrolling | `npm run test:e2e` |

123 Vitest test cases (95 unit, hook and app tests in `src`, 28 database tests) plus 3 Playwright scenarios, each run on a desktop and a phone viewport (6 browser runs). What is **not** automated: real email delivery and Supabase Realtime itself (checked by hand
with the checklist above).

## Error handling

Invalid or inconsistent splits, duplicate or over-long names and same-person repayments are rejected with a message,
and the database rejects them again if the UI is bypassed. Failed cloud writes show a friendly reason and the
affected group is re-read so the screen matches the server. Network, permission and validation errors are mapped to
plain-language messages (`src/lib/errors.js`). Malformed, oversized or hand-edited backup files and storage are
sanitised and skipped items are reported. Unknown pages and deleted groups show a 404 page; an error boundary
prevents a blank screen.

## Known limitations

- **Inviting needs an existing account.** There is no email invitation flow yet; the friend signs up first. The
  invite check also reveals whether an email has an account (acceptable for a friends app, not for a bank).
- **Same-expense edits are last-writer-wins.** Two members editing the *same* expense at the same moment: the later
  save wins. Different expenses never conflict.
- **Signed-in changes need a connection.** Offline writes are rejected with a message rather than queued.
- **No currency conversion.** Each group has one currency; it changes the symbol and format only.
- **Guest data lives only in the browser** until it is moved into an account or backed up.
- Free-tier Supabase projects pause after a period of inactivity.

## Project history

- **v1.x:** React app with guest mode and per-user cloud sync of whole groups as JSON; tests for the money logic; CI.
- **v2.0:** normalised database (one row per expense/payment/person), group sharing with roles, server-side
  validation and activity log, Realtime updates, per-group currency, React Router URLs, context-based state instead
  of prop drilling, password reset, code splitting, ESLint, database and browser test suites. Two v1 bugs were found
  and fixed along the way: a Supabase URL ending in `/rest/v1/` (as in the local `.env`) sent every auth request to a
  wrong address, and the `groups` read policy rejected `insert ... returning` for a brand-new group, which is what
  v1's sync call did (reproduced in the database tests).

## AI assistance

AI tools (Claude) were used for debugging, refactoring, the v2 restructuring, writing tests and documentation. The
author reviewed the changes and is responsible for the final product.

## Originality

Built as an original project using open-source libraries (React, React Router, Ant Design, Supabase client, Vite).
No existing application was forked.
