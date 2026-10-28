# Expense Splitter

Split shared costs with friends, flatmates or travel groups, share the group so everyone can add expenses, and
settle up with a suggested plan of at most N−1 payments for N people.

> **Links**
>
> - Author: Parth Gupta
> - Repository: https://github.com/parthgupta-5/expense-splitter
> - Live app: https://expense-splitter-two-liart.vercel.app/
> - Demo video: https://drive.google.com/drive/folders/18WCMGBshCLx_oNikPugSDe6uieNrnyx3?usp=sharing

## Problem statement

Group spending (trips, rent, dinners) ends in awkward maths: who paid, who took part, who owes whom, and how many
transfers it takes to clear everything. Spreadsheets break on uneven splits, one person ends up doing all the data
entry, and most apps force an account before they are useful.

## Target users

Friends, flatmates, couples and travel groups who share costs and want a clear, fair settle-up plan. They can start
without signing up, and sign in when they want their groups on every device or shared with the group.

## Solution

A web app that is useful **without an account**, with an optional account for sync and sharing:

- **Guest mode (no sign-up):** everything works immediately and is saved in this browser.
- **Signed in:** groups live in Postgres (Supabase), sync across devices, and can be **shared**. The creator is in the
  group from the start; friends are added by their @username (which also invites them) or as guests, and once they
  accept they add expenses and payments themselves and see each other's changes live.
- The settle-up engine nets every balance in integer cents and produces a plan with at most N-1 payments.

## Key features

1. **Groups, people and currencies.** Several groups, each with its own currency, and a reusable list of saved people.
   Names are trimmed and de-duplicated (case-insensitive).
2. **Expenses.** Pick who paid and who took part, then split **equally, by custom amounts, by shares or by
   percentages**. Splits use the largest-remainder method in whole cents, so the parts always add up exactly to the
   total. Expenses can be edited and deleted. An old expense that still names someone who has since been removed cannot
   be edited until they are added back (editing would silently move their share onto everyone else). Each row says who
   paid; who *added* an expense is in the group's history.
3. **Balances and settling up.** Live net balance per person in words ("Owes ₹150.00", "Is owed ₹300.00",
   "Settled") and a suggested repayment plan of at most N−1 payments. The group's summary says what is left to settle
   ("Ben owes you ₹1,050.00", "All settled"). Recording a repayment larger than what is owed asks for confirmation.
   Someone who still owes or is owed money cannot be removed.
4. **People and sharing.** **Participants** are the people in a group's expenses; **members** are the accounts that can
   open the group. Whoever creates a group (signed in) is its first participant, so they can pay and share at once.
   **Add people** offers two choices: **Add by username** (owner only) finds an exact @username, shows only their
   display name, @username and photo, then adds them as a person *and* sends the invitation in one step; they can be
   included in expenses straight away and get access once they accept (accepting links that same person, no
   duplicates). **Add guest** adds just a name: no account, invitation or email. Each person shows what they are (you,
   member, invitation pending, declined/expired/revoked, guest), and an answered invitation always has a next step
   (Resend, Keep as guest, Remove). Owners of older groups can add or link themselves, and an owner can take themselves
   out of the expenses when settled. Only the owner renames the group or changes its currency. Nobody sees anyone's
   email address. Changes from other members appear without a reload (Supabase Realtime).
5. **Notifications and history.** The bell lists invitations waiting for your answer (Accept or Decline right there)
   and the latest activity across your groups, live. Its count is what is new since you last opened it on this device;
   opening it never answers or hides an invitation. Every group also has a server-written log of who did what
   ("Asha added 'Dinner' · ₹1,200"), and point-in-time **saved splits** (snapshots) can be viewed later.
6. **Accounts.** Email and password sign-up confirmed with a 6-digit email code, Google sign-in, password reset by
   emailed code, and a change-password option in Settings. Each account chooses a unique @username at first sign-in and
   can upload a profile photo (re-encoded in the browser, metadata removed). Groups made before signing in can be
   moved into the account in one click. Settings has a section menu for **Account** (photo, masked email, username,
   sign-in method, display name), **Preferences** (default currency, light or dark theme) and **Data** (backup).
7. **Backup and export.** JSON backup and restore with validation, and CSV export that is safe to open in spreadsheets.
8. **Proper URLs.** Every page and every group has its own address, so the back button, refresh and bookmarks work.
9. **First-time guidance and empty states.** A short, dismissible welcome for new accounts (with "Create your first
   group") and for guests on a fresh device; every empty list says what to do next.
10. **Privacy, terms and account deletion.** Public `/privacy` and `/terms` pages (plain language, project/MVP, not
    legal advice), linked from every page footer (Settings included) and the sign-up form. Settings ends with a separate
    **Delete account** section (see "Account deletion and data retention" below).

## How using the app without signing up works

This is a deliberate design choice (guest mode), not a gap in security:

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
| Quality | ESLint (incl. React Hooks rules), GitHub Actions CI, secret scan | Every pull request and push to `main` is linted, tested and built |

## Architecture

In brief:

- **Frontend:** a React single-page app built with Vite and served as static files by Vercel. There is no custom
  server: the browser talks to Supabase directly with the public anon key and the signed-in user's token.
- **Supabase:** **Auth** handles sessions (email and password with 6-digit codes, Google, both using PKCE).
  **Postgres** holds every signed-in group as normalised rows. **Row Level Security** decides who may read or write
  each row. **Realtime** pushes new activity-log rows to the members of a group. **Storage** holds profile photos.
- **Guest mode:** with no session, the same app keeps its data in `localStorage` and never calls the database.
- **Money:** every amount is an integer number of cents (paise) in the app, in backups and in `bigint` database
  columns; splits use the largest-remainder method, so parts always add up exactly. Decimals are only for display.
- **Authorisation and ownership:** Postgres is the authority, not the UI. Group access comes from `group_members`;
  the owner (`created_by`, locked after insert) alone renames the group, changes its currency, deletes it and
  manages invitations. Invitations, membership changes and the activity log go only through security-definer
  functions and triggers, which re-check the caller. Hiding a button is only a convenience.
- **Testing:** pure logic and React screens run in Vitest (jsdom, mocked Supabase). The real SQL migrations, policies
  and rollbacks run in PGlite (Postgres compiled to WebAssembly), acting as different users. The production build is
  driven in real Chromium by Playwright. CI runs all of it on every pull request and every push to `main`.

```text
Browser (React SPA on Vercel)
 ├─ src/main.jsx                 BrowserRouter + AppProvider (context) + error boundary
 ├─ src/App.jsx                  layout and routes: /groups/:groupId, /groups, /history, /people, /settings, /profile,
 │                               /auth/callback (email links and Google), /reset-password, /privacy, /terms
 ├─ src/lazyModules.js           the pages and dialogs that load on demand, listed once (tests preload them)
 ├─ src/pages/                   one component per route (lazy-loaded)
 ├─ src/components/              forms, lists, tabs, dialogs (expense, members, group settings, auth, import)
 ├─ src/state/
 │    AppContext.jsx             provides auth + workspace + notifications to every page (no prop drilling)
 │    useAuth.js                 Supabase session, email codes, Google sign-in, password reset and change
 │    useActivityFeed.js         the bell's activity list and its per-device unread marker
 │    useInvitations.js          the user's invitations (bell + Groups page), accept/decline, per-device "seen"
 │    useGroupPeople.js          each person's status in a group (member, invitation pending, guest)
 │    useWorkspace.js            guest (localStorage) or signed-in (Supabase) data, optimistic updates, realtime
 │    workspaceReducer.js        pure state transitions (unit-tested)
 ├─ src/data/
 │    cloudRepo.js               every Supabase query and RPC in one place
 │    mappers.js                 app objects <-> database rows (money is integer cents on both sides)
 └─ src/lib/                     pure, unit-tested logic: splits, people, backup, csv, storage, currency, activity
          │  HTTPS (anon key + user JWT)          ▲ Realtime (websocket, RLS-filtered)
          ▼                                       │
Supabase (Auth, Postgres, Realtime, Storage)
 ├─ tables: profiles, groups, group_members, group_people, group_invitations, expenses, payments, saved_splits,
 │          activity_log, invitation_updates (one timestamp per account, for live invitation refreshes), plus internal
 │          username and rate-limit tables that no client can read or write
 ├─ Row Level Security on every table (members only)
 ├─ triggers: validate expenses/payments, block removing people with open balances, write the activity log
 ├─ functions: set_username, check_username, create_group, add_me_to_group, find_invitee, add_person_by_username,
 │             invite_by_username, accept/decline/revoke_invitation, keep_person_as_guest, list_my_invitations,
 │             list_group_people, list_group_members, remove_member, import_group, group_balances,
 │             account_deletion_blockers; trigger prepare_account_deletion() on auth.users
 ├─ Storage: public `avatars` bucket; each user can write and list only their own folder
 └─ Edge Function `delete-account` (supabase/functions/): the only place an account can be deleted
```

### Database design

| Table | Purpose |
|---|---|
| `groups` | Name, currency, owner (`created_by`, locked after insert) |
| `group_members` | Which **accounts** can access a group (`owner` or `member`) |
| `group_people` | The **names** in the split (friends do not need an account); unique per group, case-insensitive. `user_id` links a person to an account, set only by `create_group()` / `add_me_to_group()` (the owner themselves) or by accepting an invitation |
| `group_invitations` | Pending and answered invitations (group, person, invitee account, status, expiry, `cleared_at` for "keep as guest"); reachable only through functions |
| `invitation_updates` | One timestamp per account, bumped when an invitation to them (or in a group they own) changes; each account can read only its own row; the app listens to it on its one realtime channel |
| `expenses` | Amount in `bigint` cents, payer, split type, per-person shares (`{name: cents}`) |
| `payments` | Repayments between two different people, in cents |
| `saved_splits` | Read-only snapshots, stored as JSON documents |
| `activity_log` | Who did what, written only by triggers |
| `profiles` | Each account's name, preferences and unique `@username`; readable and writable only by its owner. The username changes only through `set_username()`; `avatar_url` may only point at the owner's own photo |

### Security model (enforced by Postgres, tested in `supabase/tests/`)

| Action | Who is allowed |
|---|---|
| Read a group and its expenses, payments, people, log | Members of that group |
| Add or edit expenses, payments, people | Members |
| Rename a group or change its currency; delete a group | Its owner |
| Look up an exact @username, add a person by username (which invites them), resend, revoke, keep as guest, remove members | Its owner |
| Add guests (names only) | Members |
| Add or link themselves as a person; take their own person out of the expenses when settled | The owner (for themselves only) |
| See each person's status | Members; invitation details (who it is for) only the owner |
| Accept or decline an invitation | Only the account it was sent to |
| Link an account to a person | Nobody directly: only by accepting an invitation for that person (or the owner linking themselves) |
| Leave a group | Any member except the owner |
| Write the activity log, add members directly | Nobody (triggers and security-definer functions only) |
| Read or change a profile (name, username, preferences) | Only its owner; the username changes only through `set_username()` |
| Upload, replace or delete a profile photo | Only its owner, in their own `avatars/<user id>/` folder |
| Delete an account | Only that account, through the `delete-account` Edge Function, after a recent sign-in and typing its @username; refused while it owns a group other members use |
| Anything at all | Not anonymous visitors |

### Security notes

- **No secrets in the repository or the browser.** The app uses only the public anon key. The `service_role` key is
  used in exactly one place: inside the `delete-account` Edge Function, for the single `deleteUser` call, read from
  the environment Supabase provides to every Edge Function. It is never in browser code, Vercel, this repository or the
  tests. Everything else that function does (checks, photo removal) runs with the caller's own token, so Row Level
  Security and Storage policies still apply. `scripts/check-secrets.mjs` runs in CI and fails on tokens, secret keys,
  private keys or tracked `.env` files. The Google client secret and SMTP credentials live only in the Supabase
  dashboard.
- **Sign-in:** PKCE flow with one `/auth/callback` route; codes and tokens are removed from the address bar at once.
  Passwords need 12+ characters with mixed character types (set in Supabase Auth).
- **Privacy:** members see each other's display names and @usernames, never email addresses.
- **Abuse limits** (database-side): 60 username checks per 10 minutes, 30 username look-ups (to add someone) per 10
  minutes, 10 username changes per hour and 30 invitations per hour per account, at most 20 pending invitations per
  group. Look-ups are exact-match only: usernames cannot be listed or searched.
- **Photos:** checked by their bytes, re-encoded to a 512 x 512 JPEG in the browser (removing EXIF and GPS), stored
  under a random name; the bucket accepts only JPEG up to 1 MB.
- **Browser hardening:** `vercel.json` sends a Content-Security-Policy (only this site, Google Fonts and
  `*.supabase.co`), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive permissions policy.
- Every schema change ships with a migration and, since usernames, a tested rollback script in `supabase/rollbacks/`.

### Key decisions

- **Validation lives in the database as well as the UI.** A trigger rejects an expense whose shares do not add up
  to the total, whose payer or participants are not in the group, or whose shares are not whole cents (including when a guest group is imported into an account). The UI checks
  first for a friendly message; the database is the guarantee, even for a hand-crafted API call.
- **One row per expense.** v1 stored each group as one JSON blob, so two people editing the same group overwrote each
  other. v2 writes one row per change, so simultaneous edits to different expenses never conflict.
- **Optimistic updates with honest rollback.** The screen updates immediately; if the database rejects the write, the
  user sees why and the group is re-read from the server.
- **One realtime channel.** Every change writes an activity row, and Realtime only delivers rows the user may read,
  so listening to `activity_log` covers expenses, payments, people, members and renames. The bell reuses that same
  channel and log: rows are merged by id, so a reload and a live update never show twice, and it lists only groups the
  user can open now. An invitee is not a member yet, so invitations come through the same channel differently: the
  user's own `invitation_updates` row (a timestamp, nothing else) changes and the app re-reads `list_my_invitations()`.
  `group_invitations` itself stays closed to clients.
- **Unread is per device.** The bell remembers the newest activity id and the pending invitations you have seen in
  `localStorage` (and follows other tabs). It is never written to Supabase, so each browser has its own count. There
  are no push, email or browser notifications.
- **The creator is added by `create_group()`, not by a trigger.** Groups imported from a device, made by an older app
  version or before this change are never altered: their owner gets a gentle "Add yourself" (or "I am already in the
  list", which links an existing guest) instead, so no historic balance changes by surprise.
- **Adding by username is one transaction.** `add_person_by_username()` creates the person and the invitation together
  (or neither), picks a free name if theirs is taken ("Ben (@ben_k)"), and refuses duplicates, recent declines and
  earlier unresolved invitations with a message that says what to do instead.
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
npm run test:unit         # only the tests in src/ (as in CI)
npm run test:db           # only the database tests (real migrations in PGlite; no Supabase project needed)
npm run test:e2e          # browser tests (first time: npx playwright install chromium)
npm run lint
npm run build             # production build in dist/
npm run check:secrets     # fails if a tracked file looks like it contains a secret
npm run preflight         # lint + tests + build + secret scan + placeholder check (run before pushing)
```

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel and `.env` | No. Use the bare project URL `https://<ref>.supabase.co`, not `.../rest/v1/` |
| `VITE_SUPABASE_ANON_KEY` | Vercel and `.env` | No (public; Row Level Security enforces access) |

The `delete-account` Edge Function reads `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which
Supabase provides to Edge Functions automatically (optional: `ALLOWED_ORIGINS`). Never put the `service_role` key in
Vercel, `.env`, any `VITE_*` variable or this repository. `.env` is git-ignored.
Vite bakes `VITE_*` values in at build time, so redeploy after changing them.

## Deployment (GitHub, Supabase, Vercel)

### 1. Supabase

1. Create a project at supabase.com.
2. SQL Editor: run these files **in this order** (each is safe to re-run):
   1. `supabase/migrations/2026102201_expense_splitter_core.sql`
   2. `supabase/migrations/2026102601_harden_groups.sql`
   3. `supabase/migrations/2026102701_normalize_and_share.sql`
   4. `supabase/migrations/2026102801_import_checks_split_total.sql`
   5. `supabase/migrations/2026102901_profiles_usernames.sql`
   6. `supabase/migrations/2026103001_avatar_storage.sql`
   7. `supabase/migrations/2026103101_username_invitations.sql`
   8. `supabase/migrations/2026110101_people_invites_account_deletion.sql`
3. Project Settings → API: copy the **Project URL** and the **anon / publishable key**.
4. Authentication → Sign In / Providers → Email: enable **Email**, turn **Confirm email** on (User Signups), set
   **Email OTP length** to 6, **Minimum password length** to 12 and **Password requirements** to lowercase,
   uppercase, digits and symbols. Sign-up and password reset use 6-digit codes: put `{{ .Token }}` in the **Confirm
   signup** and **Reset password** email templates (editing templates needs custom SMTP, e.g. Brevo or Resend).
5. Authentication → Providers → Google (optional): enable it with the Client ID and Client Secret of a Google Cloud
   OAuth *Web application* client. Its authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`
   and its authorized JavaScript origins are the Vercel URL and `http://localhost:5173`. The secret stays in Supabase.
6. Authentication → URL Configuration: set **Site URL** to the Vercel URL and add
   `https://<your-app>.vercel.app/auth/callback` and `http://localhost:5173/auth/callback` to **Redirect URLs**
   (every email link and the Google sign-in return there).

**Adding usernames to an existing project:** run migration 5 *before* deploying the app version that uses it. It
gives every existing account a provisional `user_xxxxxxxx` name, which the app asks its owner to replace at the next
sign-in. The app already deployed keeps working against it. If it must be undone, run
`supabase/rollbacks/2026102901_profiles_usernames.down.sql`; that keeps every username and never touches group data.

**Adding profile photos:** run migration 6 before deploying the app version that uses it. It creates the public
`avatars` Storage bucket (JPEG only, 1 MB per file) and its policies: each photo is stored at
`<user id>/<random uuid>.jpg`, only that signed-in user can create, change or delete objects in their own folder, and
nobody can list anyone else's photos. Photos are checked by their bytes (JPG, PNG or WebP, at most 5 MB) and re-encoded in the
browser to a 512 x 512 JPEG, which removes EXIF and GPS metadata. Undo with
`supabase/rollbacks/2026103001_avatar_storage.down.sql`, which stops serving photos without deleting any.

**Username invitations:** run migration 7 before deploying the app version that uses it. Invitations replace adding
members by email (the old function now refuses with a message, and member lists no longer include emails). An owner
invites an account by @username to be one specific person in the group; accepting links that account to that person
and adds it as a member in one transaction. Invitations expire after 30 days, a declined person cannot be offered to the
same account again for 7 days, and a group can have at most 20 pending invitations. Only the owner can rename a group
or change its currency. Existing members keep their access. Undo with
`supabase/rollbacks/2026103101_username_invitations.down.sql` (keeps every invitation and link).

**People, invitations in the bell and account deletion:** run migration 8 *before* deploying the app version that
uses it (the new app creates groups with `create_group()`). It changes no existing group, person, expense or balance.
It adds the functions above, the `invitation_updates` table (added to the Realtime publication), an owner exception to
the linked-person rule, and the account-deletion trigger on `auth.users`. It also fixes two existing problems with
deleting a user: expenses kept the deleted account's id, and a user who had recorded a payment could not be deleted.
Undo with `supabase/rollbacks/2026110101_people_invites_account_deletion.down.sql` (deploy the previous app first; it
keeps every person, link and invitation). Then deploy the `delete-account` Edge Function (below).

**Upgrading an existing v1 project:** run migrations 3 and 4. It moves every group's old JSON data into the new
tables inside one transaction, then drops the old column. Migration 4 makes group import enforce the same
"shares add up to the total" rule as normal writes. The database tests include this upgrade path.

### Account deletion (Edge Function)

The browser never deletes an account. `supabase/functions/delete-account/` (`index.ts` + `handler.js`) does, in this
order: checks the caller's token with Supabase Auth; requires a sign-in from the last 15 minutes (from the token's
`amr` claim); requires the caller's own @username typed; refuses (409) while they own a group other members use;
clears the profile photo and deletes every object in their own `avatars/<id>/` folder **with the caller's own token**;
then deletes the user with the admin key. The database trigger `prepare_account_deletion()` runs in that same
transaction. Success is reported only after the final step succeeds; any earlier failure deletes nothing else.

Deploy it by hand (nothing in this repository deploys it):

1. Supabase CLI (`npx supabase` works): `npx supabase login`, then
   `npx supabase functions deploy delete-account --project-ref <project-ref>`.
   Or Dashboard → Edge Functions → Deploy a new function → name it `delete-account` and paste `handler.js` and
   `index.ts` as two files.
2. Secrets: none to add. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to
   every Edge Function. Optional: `npx supabase secrets set ALLOWED_ORIGINS=https://<your-app>.vercel.app,http://localhost:5173`
   to limit CORS to the app (otherwise any origin may call it, which is safe because it needs the user's own token).
3. If calls fail with `401 Invalid JWT` while signed in (projects using the newer JWT signing keys), redeploy with
   `--no-verify-jwt`; the function still verifies the token itself with Supabase Auth.
4. No Vercel, Auth URL or SMTP change is needed. If you delete a user from Dashboard → Authentication, the same
   trigger runs: it refuses while that user owns a group other members use.

### Account deletion and data retention

- **Blocked** while the account owns a group that other members use: the owner deletes that group first (there is no
  ownership transfer yet). The dialog lists and links those groups.
- **Deleted at once:** the Supabase Auth user (email, password, Google identity, sessions); the profile (display name,
  @username, photo link, preferences, saved people) and the photo files; groups only they use, with everything in
  them; their memberships elsewhere; invitations to them; their username hold, rate-limit counters and
  `invitation_updates` row.
- **Kept in other people's groups:** the person they appeared as (expenses and balances refer to it by name) and the
  expenses, payments and snapshots recorded there, unlinked (`created_by` and `user_id` become null). Activity
  history keeps the events but shows "Former member" and drops their account id.
- **Afterwards:** their @username can be chosen by someone else. The app keeps no separate backups; Supabase's and
  Vercel's own backups and logs follow their policies (no specific period is claimed). This matches `/privacy`.

### 2. Vercel

1. Add New → Project, import the GitHub repo (framework preset **Vite**).
2. Environment Variables (Production, Preview, Development): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` rewrites all paths to `index.html` (so `/groups/<id>` survives a refresh), sets security
   headers including a Content-Security-Policy that allows only this site, Google Fonts and `*.supabase.co`
   (HTTPS and WebSocket for Realtime), and caches hashed assets for a year.

### 3. Verify the live app (two browsers)

- [ ] As a guest: create a group, add people, add an expense of each split type; balances and the plan are correct.
- [ ] Sign up; the "Keep the groups from this device?" dialog moves the guest group into the account.
- [ ] Invite a second account by its @username as one of the group's people; it accepts from its Groups page, the
      group appears, and an expense added there shows up in the first browser without a reload.
- [ ] The second account cannot invite people, rename the group, change its currency or delete it, and can leave.
- [ ] With the first browser's bell panel closed, add an expense in the second: a dot appears on the first browser's
      bell; opening it lists the expense at the top, clears the dot, and clicking it opens that group.
- [ ] Password reset emails a 6-digit code that leads to the new-password page; refreshing any page does not 404.
- [ ] Create a group while signed in: you appear in Participants, Who paid and Split between straight away.
- [ ] Add people → Add by username: the second account's bell shows "… invited you to join …" with a count; the owner
      can include them in an expense before they accept; accepting from the bell opens the group, and Participants shows
      them as a Member (no duplicate person). Decline/revoke updates both browsers without a reload.
- [ ] Settings → Delete account on a throwaway account: blocked while it owns a shared group; after deleting that
      group (and signing in again if asked), it is deleted, signed out, and its photo URL no longer loads.
- [ ] `/privacy` and `/terms` open without signing in.
- [ ] No console errors (including Content-Security-Policy violations).

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sign-in fails with a 404 or "Invalid path" | `VITE_SUPABASE_URL` ends in `/rest/v1/`; use the bare project URL (the app also trims it) |
| Only guest mode is offered | Env vars missing at build time: add them in Vercel, redeploy |
| `relation "public.expenses" does not exist` | Migration 3 has not been run |
| "No account has that username" | The friend must sign up and choose their @username first |
| Changes from others appear only after switching tabs | Realtime blocked (check CSP `wss://*.supabase.co`) or the Realtime service is paused |
| The bell's panel says "Live updates are unavailable" | Same as above; the panel still shows recent history and re-reads it when opened |
| Email links open localhost | Supabase Site URL / Redirect URLs still point to localhost |

## Testing

| Suite | What it proves | Command |
|---|---|---|
| Unit (Vitest) | Split, balance and settlement maths (exact cents, random property tests), balances and the settle-up summary in words, money input parsing, name and username rules, removed people in old expenses, email masking, CSV escaping, backup and storage sanitising, cents mapping, reducer transitions, photo checks, sign-in redirects, activity text | `npm run test:unit` |
| Hook (Vitest + mocked API) | Optimistic updates, rollback with an error message when the server rejects a write, live refresh, guest-to-account import, account data never written to the device | `npm run test:unit` |
| App (Vitest + jsdom) | Routing and readable group addresses, adding people and an expense from the Add expense dialog, the group summary and settlement in words, refusing to edit an old expense that names a removed person, 404 pages, sign-in and code screens, Settings (section menu and focus, account rows, masked email, theme) and photo upload, the participants list (creator added on create, add by username with safe look-up results, add guest, resend, revoke, keep as guest, add yourself), invitations on the Groups page and in the bell (count, accept, decline, stale removal, other tabs), activity (live updates without duplicates, access filtering, keyboard), onboarding and empty states, policy pages and links, account deletion (blocked, confirmed, re-sign-in, failure) | `npm run test:unit` |
| Database (PGlite) | The real migrations: RLS isolation between users (and RLS on every table), anonymous access denied, validation triggers, sharing rules, activity log, usernames and rate limits, invitations, people and add-by-username, invitation signals, account deletion (blocking, cleanup, shared history), avatar Storage policies, rollback scripts, upgrades of existing data, SQL balances equal JS balances, removing a settled person keeps old expenses and balances unchanged; plus the `delete-account` Edge Function's handler with fake clients | `npm run test:db` |
| Browser (Playwright) | Production build in Chromium on desktop and a phone viewport: full guest flow, persistence after reload, per-group currency, every URL loads, money input rules, sign-in address cleanup and sign-up form, photo re-encoding and refusals, guests see no sharing or bell, welcome and dismissal, the Add people dialog by keyboard, the Add expense dialog, Settings section menu by keyboard and theme, policy pages and footer links, empty states, no console errors, no sideways scrolling | `npm run test:e2e` |

476 Vitest test cases (358 unit, hook, app and rollback-compatibility tests in `src`; 118 database and Edge Function
tests) plus 20 Playwright scenarios, each run on a desktop and a phone viewport (40 browser runs). What is **not**
automated: real email delivery, Supabase Realtime itself, signed-in flows in a real browser (the browser tests run
without a Supabase project) and the deployed Edge Function (checked by hand with the checklist above).

## Error handling

Invalid or inconsistent splits, duplicate or over-long names and same-person repayments are rejected with a message,
and the database rejects them again if the UI is bypassed. Failed cloud writes show a friendly reason and the
affected group is re-read so the screen matches the server. Network, permission and validation errors are mapped to
plain-language messages (`src/lib/errors.js`). Malformed, oversized or hand-edited backup files and storage are
sanitised and skipped items are reported. Unknown pages and deleted groups show a 404 page; an error boundary
prevents a blank screen. Wrong or expired email codes, an expired sign-in link and a cancelled Google sign-in each get
a specific message. Unsupported or oversized photos are refused before upload. An invitation that has expired or was
revoked shows the database's reason and nothing changes. The activity bell has loading, empty, error-with-Retry and
"live updates unavailable" states, and still shows recent history when Realtime is down.

## Known limitations and deferred work

- **Adding by username needs an existing account with a chosen @username.** There are no invitation emails; the friend
  signs up first (or is added as a guest meanwhile). Looking up a username shows that account's display name and photo
  to a group owner (exact match only, rate limited).
- **No ownership transfer.** An owner whose group other members use must delete that group before deleting their
  account.
- **People are referenced by name in expenses.** A settled person can be removed while old expenses still name them.
  The app refuses to edit such an expense, and the database refuses to save one that names someone not in the group,
  but deleting such an old expense or payment is still allowed and can leave the removed person with a balance that
  cannot be settled until they are added back. A database-level rule for this is not built yet.
- **A deleted account's @username is free at once**, and its name stays as a person in other people's groups (their
  expenses refer to it).
- **Same-expense edits are last-writer-wins.** Two members editing the *same* expense at the same moment: the later
  save wins. Different expenses never conflict.
- **The bell's count is per device.** Opening the panel on your phone does not clear the count on your laptop (other
  tabs of the same browser do follow), and it shows the latest 30 activity entries (the History page shows more).
- **Signed-in changes need a connection.** Offline writes are rejected with a message rather than queued.
- **No currency conversion.** Each group has one currency; it changes the symbol and format only.
- **Guest data lives only in the browser** until it is moved into an account or backed up.
- Free-tier Supabase projects pause after a period of inactivity.
- **No notifications outside the app.** There are no push, email or browser notifications; the bell is in-app only.

Consciously deferred (not built yet):

- **Removing the retired email-invitation functions.** `invite_member()` now refuses with a message and
  `list_members()` returns no emails; both are kept only so an older deployed app fails politely. A later migration
  can drop them.

## Project history

- **v1.x:** React app with guest mode and per-user cloud sync of whole groups as JSON; tests for the money logic; CI.
- **v2.0:** normalised database (one row per expense/payment/person), group sharing with roles, server-side
  validation and activity log, Realtime updates, per-group currency, React Router URLs, context-based state instead
  of prop drilling, password reset, code splitting, ESLint, database and browser test suites. Two v1 bugs were found
  and fixed along the way: a Supabase URL ending in `/rest/v1/` (as in the local `.env`) sent every auth request to a
  wrong address, and the `groups` read policy rejected `insert ... returning` for a brand-new group, which is what
  v1's sync call did (reproduced in the database tests).
- **After v2.0 (pull requests #2 to #7):** exact two-decimal money inputs; unique @usernames; email codes, Google
  sign-in and change password; readable group addresses (`/groups/goa-trip`); profile photo uploads; invitations by
  @username with accept and decline; the activity bell.
- **People, notifications and privacy:** the creator is a person from the start; Add people (by username, which also
  invites, or as a guest) with clear statuses and next steps; invitations in the bell; first-time welcome and empty
  states; Privacy Policy and Terms; account deletion through an Edge Function with a documented retention policy.

## AI assistance

AI tools (Claude) were used for debugging, refactoring, the v2 restructuring, writing tests and documentation. The
author reviewed the changes and is responsible for the final product.

## Originality

Built as an original project using open-source libraries (React, React Router, Ant Design, Supabase client, Vite).
No existing application was forked.
