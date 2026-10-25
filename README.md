# Expense Splitter

Split shared costs with friends, flatmates or travel groups, then settle up with the fewest possible payments.

- **Live app:** `https://<your-project>.vercel.app` <!-- TODO: fill in after deploying -->
- **Demo video:** `<link>` <!-- TODO -->
- **Repository:** `https://github.com/<user>/expense-splitter` <!-- TODO -->

## Problem statement

Group spending (trips, rent, dinners) ends in awkward maths: who paid, who owes whom, and how many transfers it takes to clear everything. Spreadsheets break on uneven splits, and most apps force an account before they are useful.

## Target users

Friends, flatmates, couples and travel groups in India and beyond (multi-currency display) who share costs and want a clear, fair settle-up plan without signing up first.

## Solution

A guest-friendly web app: everything works instantly and is saved on the device. Signing in with email adds cloud sync across devices and saved split history. The settle-up engine nets every balance and produces a minimal-transfer repayment plan.

## Key workflows

1. **Create a group and add people** — multiple groups, reusable saved-people list.
2. **Add an expense with a fair split** — equal (cent-exact rounding), custom amounts, shares, or percentages, with validation that the split adds up. Expenses are editable.
3. **See balances and settle up** — live net balance per person and a minimal-transfer plan; record repayments and balances update immediately.
4. **Save a split snapshot** — point-in-time record of expenses, payments and settlements, kept in account-backed history (sign-in prompted only here).
5. **Sync and back up** — Supabase email auth, per-user cloud sync protected by Row Level Security, JSON backup/restore and CSV export.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + Vite + Ant Design | Fast SPA, accessible components |
| Auth + DB | Supabase (Postgres, Auth) | Managed auth and RLS replace a custom backend |
| Hosting | Vercel (static SPA) | Free tier, deploys on every push |
| Tests / CI | Vitest, GitHub Actions | Money logic is unit-tested on every push |

## Architecture

```text
Browser (React SPA on Vercel)
 ├─ src/lib/splits.js   pure logic: computeSplit / validateSplit / computeBalances / computeSettlements (unit-tested)
 ├─ src/main.jsx        UI, local persistence (localStorage), guest-first flow
 ├─ src/supabase.js     data access: groups, profiles (only when env vars are set)
 └─ src/ErrorBoundary   recovery screen on unexpected render errors
          │  HTTPS (anon key + user JWT)
          ▼
Supabase: Auth ─ Postgres (profiles, groups, group_members) with Row Level Security
```

Key decisions:

- **No custom server.** All authorization lives in Postgres RLS policies (`supabase/migrations/`): users can only read/update groups they are members of, delete only groups they created, and read/update only their own profile.
- **Local-first.** The app is fully usable offline/as a guest; cloud sync merges by group id on sign-in and debounce-saves changes (650 ms).
- **Money logic is isolated** from React so rounding, validation and settlement are tested (`npm test`).
- Group expenses and payments are stored as JSONB on the group row — simple sync, at the cost of whole-group writes (acceptable at this scale; a normalized expenses table is the next step for concurrent editing).

## Local setup

```bash
git clone <repo-url> && cd expense-splitter
npm install
cp .env.example .env      # optional: without it the app runs in local-only mode
npm run dev               # http://localhost:5173
npm test                  # unit tests
npm run build && npm run preview
```

### Supabase (optional, enables accounts + sync)

1. Create a project at supabase.com.
2. Run `supabase/migrations/2026102201_expense_splitter_core.sql` in the SQL Editor.
3. Authentication → Providers: enable Email. Under URL Configuration set **Site URL** to your deployed URL and add `http://localhost:5173` to Redirect URLs.
4. Copy the Project URL and anon/publishable key into `.env`.

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel + `.env` | No (public) |
| `VITE_SUPABASE_ANON_KEY` | Vercel + `.env` | No (public; RLS enforces access) |

No server-side secrets are used. Never expose the `service_role` key. `.env` is git-ignored.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the step-by-step Vercel + Supabase guide, verification checklist and troubleshooting.

## Error handling

Invalid or inconsistent splits are rejected with a message; same-person repayments are blocked; cloud load/save/delete failures show an error and local data is kept; malformed backup files are rejected before import; corrupt local storage falls back to a fresh state; an error boundary prevents a blank screen.

## Originality

Built as an original project; uses open-source libraries (React, Ant Design, Supabase client, Vite). No existing application was forked.
