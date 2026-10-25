# End-term submission sheet (form: https://forms.gle/sBy4sfqyiRG2Zpom9 — deadline 27 Oct 2026, 11:59 PM IST)

Project Name: Expense Splitter
Student Name: <your name>
Problem Statement: Groups lose track of who paid and who owes whom; uneven splits and settle-up need correct, fair maths without forcing sign-up.
GitHub Repository: <url>
Deployed Application / Build: <vercel url>
Demo Video: <url>
Tech Stack: React 19, Vite, Ant Design, Supabase (Auth + Postgres + RLS), Vercel, Vitest, GitHub Actions
Major Features:
1. Groups + reusable people list
2. Equal / custom / share / percentage splits with validation and cent-exact rounding
3. Live balances + minimal-transfer settlement plan, repayment tracking
4. Saved split snapshots + account history (Supabase auth, RLS)
5. Local-first persistence, cloud sync, JSON backup/restore, CSV export

## Demo script (3–5 min)
1. 0:00 Problem: the trip-money argument. Who it is for.
2. 0:30 Create group, add 4 people (guest mode, no sign-up).
3. 1:15 Add expenses: equal dinner, percentage hotel, shares for a cab. Show a rejected bad split.
4. 2:15 Balances + settlement plan; record a repayment, watch balances update.
5. 3:00 Save split → sign-up prompt → account history.
6. 3:45 Open on a second browser: synced. Mention RLS and tests/CI.
7. 4:30 Close with architecture slide/README.

## Final checklist
- [ ] Repo public, no `.env`/secrets in history (`git log -p | grep -i service_role` is empty)
- [ ] Deployed URL, repo and video open in incognito
- [ ] README TODO links filled in
- [ ] Form submitted before the deadline
