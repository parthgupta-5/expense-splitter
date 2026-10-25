# End-term submission sheet

Form: https://forms.gle/sBy4sfqyiRG2Zpom9 — deadline **27 Oct 2026, 11:59 PM IST**.
Fill in the four owner values below, then run `npm run check:submit`.

Project Name: Expense Splitter

Student Name: <your name>

Problem Statement: Groups lose track of who paid, who took part and who owes whom. Uneven splits, partial participation
and settling up need correct, fair maths (down to the cent), and most apps force a sign-up before they are useful.
Expense Splitter lets a group split costs four ways, see live balances and get a minimal-transfer settle-up plan,
working instantly as a guest and syncing across devices after an optional sign-in.

GitHub Repository: <url>

Deployed Application / Build: <url>

Demo Video: <url>

Tech Stack: React 19, Vite, Ant Design, Supabase (Auth, Postgres, Row Level Security), Vercel, Vitest and Testing
Library, GitHub Actions CI.

Major Features:

1. Groups and a reusable saved-people list, with duplicate and over-long names rejected.
2. Expenses with a choice of who takes part and four split methods (equal, custom amounts, shares, percentages),
   calculated in whole cents so parts always sum exactly to the total.
3. Live balances, a minimal-transfer settle-up plan, repayment tracking with an over-payment confirmation, and
   removal rules that protect people who still owe or are owed money.
4. Saved split snapshots and history, with Supabase email accounts protected by Row Level Security.
5. Local-first storage, per-group cloud sync that keeps the newer copy, validated JSON backup and restore,
   spreadsheet-safe CSV export, and sign-out that clears the device.

## Demo script (3 to 5 minutes)

Prepare before recording: deploy the app, create two accounts, and sign in to the second account in another browser
window so it is ready to switch to.

1. **0:00 Problem and users.** The trip-money argument; who it is for.
2. **0:25 Guest start.** Create a group and add four people (show a duplicate name being rejected). No sign-up needed.
3. **1:00 Expenses.** Add an equal dinner for everyone; a hotel by percentages; a cab shared by only two people
   (choose participants). Show a bad split being rejected.
4. **2:00 Balances and settling.** Open Balances and the suggested payments. Record a repayment, watch balances update,
   then try an over-payment to show the confirmation.
5. **2:50 Save and sign up.** Save the split, create an account, and open History.
6. **3:20 Sync.** Switch to the prepared second window (already signed in) and show the same groups there.
7. **3:50 Sign-out.** Sign out and show that the groups are cleared from the device.
8. **4:15 Engineering.** One slide or the README architecture section: React SPA, Supabase with Row Level Security,
   tested money logic and CI.

## Final checklist

- [ ] Repository is public and contains no `.env` or secrets (`npm run check:secrets` passes)
- [ ] Deployed URL, repository and video open in an incognito window
- [ ] Links block at the top of the README filled in
- [ ] `npm run check:submit` passes
- [ ] Form submitted before the deadline
