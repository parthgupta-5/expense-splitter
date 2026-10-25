# Owner runbook: push, deploy and submit

These are the only steps left after the code work is finished. **Render is not needed:** the app has no backend
server, only Vercel (hosting) and Supabase (accounts and database).

Deadline: **27 Oct 2026, 11:59 PM IST**. Form: https://forms.gle/sBy4sfqyiRG2Zpom9

## 1. Unzip and check

```bash
unzip expense-splitter-ready.zip
cd expense-splitter-main
npm ci
npm run preflight
git log --oneline
git status
```

Expected: tests pass, the build succeeds, the secret scan passes, `git status` is clean and the log shows one commit per
task. Warnings about placeholders (name, links) are normal until step 6.

## 2. Push to GitHub

On GitHub create a new empty **public** repository called `expense-splitter` (do not add a README, .gitignore or
license). Then run, replacing the username:

```bash
git remote add origin https://github.com/<your-username>/expense-splitter.git
git branch -M main
git push -u origin main
```

If asked to log in, use `gh auth login` (GitHub CLI) or a personal access token as the password. Open the repository's
**Actions** tab and confirm CI is green. Open the repository in an incognito window to confirm it is public and has
no `.env` file.

## 3. Create the Supabase project

1. At supabase.com choose **New project**. Note the database password and pick a nearby region. Wait until it is ready.
2. Open **SQL Editor** and run these two files, in this order. Each should finish with a success message, and running
   them twice is harmless:
   1. `supabase/migrations/2026102201_expense_splitter_core.sql`
   2. `supabase/migrations/2026102601_harden_groups.sql`
3. Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**. Never copy the
   `service_role` key anywhere.
4. Open **Authentication → Providers** and make sure **Email** is enabled. For evaluation, turn **Confirm email** off,
   because Supabase's built-in email sender is heavily rate-limited.

## 4. Deploy on Vercel

1. At vercel.com choose **Add New → Project** and import the GitHub repository. Framework preset **Vite**, root directory
   the repository root. `vercel.json` already sets the build command, output folder, page rewrites and security headers.
2. Before deploying, add two environment variables for Production, Preview and Development:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, using the values from step 3.
3. Deploy and copy the live URL.
4. In Supabase open **Authentication → URL Configuration**. Set **Site URL** to the Vercel URL and add that URL plus
   `http://localhost:5173` to **Redirect URLs**.
5. If you added the variables after the first deploy, open **Deployments → Redeploy**, because Vite bakes them in at
   build time.

## 5. Test the live app in an incognito window

- [ ] The app loads, and refreshing any page does not give a 404.
- [ ] Create a group, add people and add an expense of each split type, including one where only some people take
      part: balances and the settlement plan look right.
- [ ] Record a repayment larger than what is owed: you are asked to confirm.
- [ ] Sign up with one email, save a split, and see it under History.
- [ ] Sign in with a second email in another browser: it must not see the first user's groups.
- [ ] Sign out: the groups on screen are cleared.
- [ ] The browser console has no errors (including no Content-Security-Policy violations), and network calls go to
      `*.supabase.co`.

## 6. Fill in the links

Edit `README.md` (the links block at the top) and `docs/SUBMISSION.md` (name, repository, deployed URL, video URL).
Then run:

```bash
npm run check:submit
git add -A
git commit -m "docs: add live links and submission details"
git push
```

`check:submit` passes only when no placeholder is left. Vercel redeploys on every push.

## 7. Record the demo video

Follow the script in `docs/SUBMISSION.md` (3 to 5 minutes), recorded against the live Vercel URL, not localhost. Prepare
the second signed-in window before recording. Upload the video to YouTube as **Unlisted**, or to Google Drive with
"Anyone with the link can view". Open the link in an incognito window to check it plays.

## 8. Submit the form

Open the form and paste the fields from `docs/SUBMISSION.md`. Submit well before the deadline. Then open the repository,
live app and video links once more in an incognito window. Log in to Supabase just before submitting to confirm the
free project has not paused.
