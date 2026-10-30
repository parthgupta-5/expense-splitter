# Testing

| Suite | What it covers | Command |
|---|---|---|
| Unit | Split and settlement maths, money parsing, name rules, CSV, backup checks, reducers | `npm run test:unit` |
| App (jsdom) | Real screens with mocked data: routing, adding people and expenses, invitations, friend requests, account deletion and restore | `npm run test:unit` |
| Database (PGlite) | The real SQL migrations in Postgres (WebAssembly), acting as different users: Row Level Security, validation triggers, sharing rules, deletion window, rate limits, rollbacks | `npm run test:db` |
| Browser (Playwright) | The production build in Chromium on desktop and phone sizes: the guest flow, persistence, every URL, policy pages, no console errors | `npm run test:e2e` |

CI runs the secret scan, lint, unit and database tests, the build and the browser tests on every pull request and push to `main`.

Not automated: real email delivery, Supabase Realtime itself, and the deployed Edge Functions. These are checked by hand.