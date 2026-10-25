# Expense Splitter

Split shared costs with friends, flatmates or travel groups, then settle up with the fewest possible payments.

> **Links (owner fills these in before submitting)**
>
> - Author: TODO (student name)
> - Live app: TODO (Vercel URL)
> - Demo video: TODO (video link)
> - Repository: TODO (GitHub URL)

## Problem statement

Group spending (trips, rent, dinners) ends in awkward maths: who paid, who took part, who owes whom, and how many
transfers it takes to clear everything. Spreadsheets break on uneven splits, and most apps force an account before
they are useful.

## Target users

Friends, flatmates, couples and travel groups who share costs and want a clear, fair settle-up plan without signing
up first. Amounts can be shown in six currencies (display only, see Known limitations).

## Solution

A guest-first web app. Everything works immediately and is saved on the device. Signing in with email adds cloud
sync across devices and a saved-split history. The settle-up engine nets every balance and produces a
minimal-transfer repayment plan.

## Key workflows

1. **Groups and people** — create several groups and keep a reusable list of saved people. Names are trimmed and
   de-duplicated (case-insensitive); a person who still owes or is owed money cannot be removed.
2. **Add an expense** — pick who paid and **who took part**, then split **equally, by custom amounts, by shares or by
   percentages**. Splits are calculated in whole cents with the largest-remainder method, so the parts always add up
   exactly to the total. Inconsistent splits are rejected with a message. Expenses can be edited.
3. **Balances and settling up** — live net balance per person and a suggested plan with at most N-1 payments.
   Recorded repayments update balances at once; a repayment larger than what is owed asks for confirmation.
4. **Save a split snapshot** — a point-in-time record of expenses, payments and settlements kept in History
   (sign-in is requested only here when cloud accounts are configured).
5. **Sync, backup and export** — Supabase email sign-in with per-group cloud sync (newer copy wins), JSON backup and
   restore with validation, and CSV export that is safe to open in spreadsheets. Signing out clears this device so
   the next person does not see your groups.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19, Vite, Ant Design | Fast SPA with accessible components |
| Auth + data | Supabase (Auth, Postgres, Row Level Security) | Managed auth and per-user access rules, no custom server |
| Hosting | Vercel (static SPA) | Free tier, redeploys on every push |
| Tests / CI | Vitest, Testing Library, GitHub Actions | Money logic and data handling are tested on every push |

## Architecture

```text
Browser (React SPA on Vercel)
 ├─ src/main.jsx, App.jsx        entry point and app shell (routing by state, modals, handlers)
 ├─ src/components/              Dashboard, ExpenseForm, PaymentForm, tables, pages, modals
 ├─ src/hooks/                   useLocalState (persistence), useCloudSync (auth, merge, saves), useExpenseForm
 ├─ src/lib/                     pure, unit-tested logic
 │    splits.js    split / balance / settlement maths (integer cents)
 │    sync.js      merge of local and cloud groups     backup.js   sanitising of imports, storage and cloud data
 │    csv.js, people.js, errors.js, currency.js, storage.js, history.js, limits.js, url.js
 └─ src/supabase.js              data access (only active when the env vars are set)
          │  HTTPS (anon key + user JWT)
          ▼
Supabase: Auth ─ Postgres (profiles, groups, group_members) protected by Row Level Security
```

Key decisions:

- **No custom server.** Authorisation lives in Postgres policies (`supabase/migrations/`): users read/update only
  groups they are a member of, delete only groups they created, and access only their own profile. A second migration
  locks `created_by` and makes `updated_at` server-controlled.
- **Local-first.** The app is usable offline and as a guest. On sign-in, local and cloud groups are merged by id
  (`src/lib/sync.js`); changed groups are saved one by one so a single bad group cannot block the rest.
- **Money logic is isolated from React** so rounding, validation, balances and settlement are unit-tested.
- Expenses and payments are stored as JSONB on the group row. That keeps sync simple at the cost of whole-group writes.
- `group_members` already exists in the database for future group sharing, but **inviting other members is not
  implemented yet**: every group currently has exactly one member, its creator.

## Local setup

Requires Node 20.19+ or 22.12+.

```bash
npm install
cp .env.example .env      # optional: without it the app runs in local-only (guest) mode
npm run dev               # http://localhost:5173
npm test                  # unit and component tests
npm run build && npm run preview
npm run preflight         # tests + build + secret scan + placeholder check (run before pushing)
```

### Supabase (optional, enables accounts and sync)

1. Create a project at supabase.com.
2. In the SQL Editor run, **in this order**:
   1. `supabase/migrations/2026102201_expense_splitter_core.sql`
   2. `supabase/migrations/2026102601_harden_groups.sql` (locks `created_by`, makes `updated_at` server-controlled)
3. Authentication → Providers: enable Email. Under URL Configuration set **Site URL** to your deployed URL and add
   `http://localhost:5173` to Redirect URLs.
4. Copy the Project URL and the anon/publishable key into `.env`.

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel and `.env` | No (public) |
| `VITE_SUPABASE_ANON_KEY` | Vercel and `.env` | No (public; Row Level Security enforces access) |

No server-side secrets are used. Never put the `service_role` key anywhere in this project. `.env` is git-ignored.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the Vercel and Supabase steps, a verification checklist and
troubleshooting, and [docs/HANDOFF.md](docs/HANDOFF.md) for the step-by-step push, deploy and submit runbook.

## Error handling

Invalid or inconsistent splits, duplicate or over-long names and same-person repayments are rejected with a message.
Cloud load, save and delete failures show a friendly error and local data is kept; groups that fail to sync are named.
Malformed, oversized or hand-edited backup files, storage and cloud data are sanitised and the number of skipped
items is reported. An error boundary prevents a blank page.

## Testing

`npm test` runs Vitest:

- **Covered:** split, balance and settlement maths (exact cents, participants, random-group property tests), payment
  over-payment check, name parsing and removal rules, CSV escaping, backup/storage/cloud sanitising, cloud merge
  cases, friendly error mapping, URL validation, history ordering, and one component test for the expense form.
- **Not covered:** the Supabase database policies and migrations (they must be checked against a real project),
  real sign-in/sync against Supabase, and most UI flows beyond the expense form. These were checked by hand.

## Known limitations

- **Sync is whole-group, last-write-wins.** If the same group is edited on two devices, the newer edit wins and the
  other is replaced (you are told when a local edit is replaced).
- **No group sharing yet.** Groups belong to one account; there is no invite flow.
- **Single currency per account.** The currency setting changes the symbol and number format only; there is no
  conversion between currencies.
- **Guest data lives only in the browser.** It is lost if site data is cleared. Use Download backup to keep a copy.
- Free-tier Supabase projects pause after a period of inactivity.

## Project history

This repository starts from a snapshot of an earlier working version of the app (no earlier commits are available
here). That snapshot contained the React app plus leftover files from an old vanilla-JS version and an unrelated
music-API server. The history in this repository then shows: removal of the leftovers and a corrected Vercel config;
extraction of the money logic into a tested module; CI and documentation; a round of security and correctness fixes
(sign-out data clearing, per-group sync, CSV formula protection, exact-cent splits, per-expense participants,
validation of imported data, a Content-Security-Policy and a hardening migration); a split of the single large UI
file into components and hooks; and a larger test suite.

## AI assistance

AI tools (Claude) were used for debugging, refactoring, writing tests and documentation. The author is responsible
for the final product. <!-- TODO: owner to confirm or adjust this statement -->

## Originality

Built as an original project using open-source libraries (React, Ant Design, Supabase client, Vite). No existing
application was forked.
