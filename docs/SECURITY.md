# Security

Access is decided by Postgres, not by the UI. The UI hides buttons for convenience, but the database refuses anything a user is not allowed to do.

## Who may do what

| Action | Who is allowed |
|---|---|
| Read a group and its data | Members of that group |
| Add or edit expenses, payments and guests | Members |
| Rename, change currency, delete a group | Owner |
| Add by username, resend, revoke, remove members | Owner |
| Accept or decline an invitation or friend request | Only the recipient |
| Send or cancel a friend request, remove a friend | The signed-in user, for themselves |
| Read or change a profile | Only its owner |
| Switch an account off | That account, after a recent sign-in and typing its @username |
| Restore a switched-off account | That account, within 7 days |
| Delete an account for good | The scheduled purge job, after 7 days |
| Anything | Not anonymous visitors |

## Secrets

- The browser only uses Supabase's public key.
- The `service_role` key exists only inside the Edge Functions.
- The purge function needs a `CRON_SECRET` header, so nobody else can trigger it.
- `scripts/check-secrets.mjs` runs in CI and fails on keys or tracked `.env` files.

## Other measures

- **Sign-in:** PKCE flow, codes removed from the address bar, passwords of 12+ characters with mixed types.
- **Privacy:** other users see your display name, @username and photo, never your email. Usernames can only be found by exact match.
- **Rate limits:** username checks, invitations and friend requests are limited per account.
- **Photos:** checked by their bytes, re-encoded to a 512 x 512 JPEG in the browser (which strips EXIF and GPS data).
- **Headers:** `vercel.json` sends a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive permissions policy.
- **Migrations:** every schema change has a migration and a tested rollback.