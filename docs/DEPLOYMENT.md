# Deployment guide (Vercel + Supabase)

Adapted from the course deployment guide for this stack. Expense Splitter has **no custom backend**, so the Render/Express/CORS/cookie steps do not apply: the Vite SPA calls Supabase directly, and Supabase handles auth tokens and CORS.

| Part | Service |
|---|---|
| Source | GitHub |
| Frontend | Vercel (static Vite build, `vercel.json`) |
| Auth + Database | Supabase |

## 1. Pre-flight

```bash
npm ci && npm test && npm run build
git status           # .env must NOT be listed
```

## 2. Supabase

1. New project → note the **Project URL** and **anon/publishable key** (Settings → API).
2. SQL Editor → run `supabase/migrations/2026102201_expense_splitter_core.sql`.
3. Authentication → Providers → Email enabled. For a smooth demo you may turn off "Confirm email"; for real use keep it on.
4. Authentication → URL Configuration: set **Site URL** to the Vercel URL (after step 3) and add it plus `http://localhost:5173` to **Redirect URLs**.

## 3. Vercel

1. Vercel → Add New Project → import the GitHub repo. Framework preset: **Vite** (root directory: repo root).
2. Environment Variables (Production, Preview, Development):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. Vite bakes `VITE_*` values at build time, so **redeploy after changing them**.
4. Copy the deployed URL back into Supabase Site URL / Redirect URLs.

`vercel.json` rewrites all paths to `index.html` (refresh-safe) and sets security headers and immutable caching for hashed assets.

## 4. Verify (in an incognito window)

- [ ] App loads; reload on any view does not 404.
- [ ] Create group → add people → add expense (try all four split types) → balances and settlement plan are correct.
- [ ] Sign up / sign in works; "Save split" appears in History.
- [ ] Refresh and sign in on a second browser: groups sync.
- [ ] Second user cannot see the first user's groups (RLS).
- [ ] No errors in the browser console; network calls go to `*.supabase.co`, not localhost.

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App says "Saved locally" and never offers cloud sync | Env vars missing at build time → add in Vercel, redeploy |
| Sign-up email link opens localhost | Supabase Site URL still localhost |
| `permission denied` / `new row violates row-level security` | Migration not run, or not signed in |
| `Invalid API key` | Wrong key, or the key was pasted with spaces |
| 404 on refresh | `vercel.json` rewrite missing |

## 6. Updating

`git push origin main` → Vercel redeploys automatically; CI (`.github/workflows/ci.yml`) runs tests and the build.
