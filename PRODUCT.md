# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Friends, flatmates, couples and travel groups who share costs. The primary user is the organizer: the one person who logs expenses and settles up, usually on a phone, mid-trip or right after a dinner. Other group members can join a shared group and add their own expenses and payments. They do not need an account to be named in a split.

## Product Purpose

Split shared costs and settle up with the fewest possible payments. Success is that a group can record who paid and who took part, trust the balances, and clear everything with at most N-1 transfers, without spreadsheet maths or one person doing all the data entry.

## Positioning

Two things together that a neighboring app could not truthfully copy:

- Core expense tracking works without sign-up, using browser-local guest data. An account unlocks sharing, live sync, and activity history.
- The numbers are provably exact and consistent for everyone. Money is integer cents with largest-remainder splitting, and Postgres Row Level Security and triggers enforce validation and access.

## Operating Context

Used on a phone in the moment (adding an expense, recording a repayment), and on any device once signed in. Groups are shared by inviting members by the email they signed up with. Changes from other members appear live via Supabase Realtime. Data can be backed up and restored as JSON and exported as spreadsheet-safe CSV.

## Capabilities and Constraints

- Several groups, each with its own currency, plus a reusable list of saved people (names trimmed, case-insensitive de-duplication).
- Expenses split equally, by custom amounts, shares or percentages. Expenses can be edited and deleted.
- Live net balances and a suggested repayment plan. A repayment larger than what is owed asks for confirmation. A person with an open balance cannot be removed.
- Sharing, a server-written activity history, and saved split snapshots (signed-in only).
- Accounts: email sign-up and sign-in, password reset, profile name and avatar. Guest groups can be moved into an account.
- Stack: React 19, React Router 7, Ant Design 6, Vite, Supabase, hosted on Vercel as a static SPA. Every page and group has its own URL.
- Guest data exists only in that browser and is lost if site data is cleared.

## Brand Commitments

Name: Expense Splitter. Author: Parth Gupta. No other binding voice, logo or identity constraints were stated.

## Evidence on Hand

The README, the database test suite and the app icons (`public/icon.png`, `public/apple-touch-icon.png`). The live app URL and demo video are still TODO. There are no testimonials, customers or usage numbers; do not invent any.

## Product Principles

- Fast to first expense: nothing stands between opening the app and logging a cost.
- Money is exact: displayed totals and splits always reconcile to the cent.
- Guest first, account optional: sign-in is an upgrade, never a gate.
- Make the settle-up plan the payoff: balances and who-pays-whom are always easy to read.
- Phone first: the organizer's one-handed, in-the-moment use comes before desktop bookkeeping.
