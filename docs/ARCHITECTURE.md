# Architecture

The app is a React single-page app that talks to Supabase directly. There is no custom backend server.

## Frontend

- `src/main.jsx`: router, shared app state and error boundary
- `src/App.jsx`: layout and routes
- `src/pages/`: one component per route, loaded on demand
- `src/state/`: auth, workspace (guest or signed-in data), invitations, friends
- `src/data/cloudRepo.js`: every Supabase query and function call
- `src/lib/`: pure logic for splits, balances, settlement, money, backup and CSV

## Supabase

- **Auth:** email with 6-digit codes, and Google sign-in (PKCE)
- **Postgres:** normalised tables, Row Level Security on every table, validation triggers and security-definer functions for multi-step actions
- **Realtime:** delivers changes to members, and a per-user signal for invitations and friend requests
- **Storage:** an `avatars` bucket where each user writes only to their own folder
- **Edge Functions:** `delete-account` (switches an account off) and `purge-deleted-accounts` (final deletion, run daily)

## Database tables

| Table | Purpose |
|---|---|
| `groups` | Name, currency, owner |
| `group_members` | Accounts that can open a group |
| `group_people` | Names in the split; may or may not have an account |
| `expenses` | Amount in cents, payer, split type, shares |
| `payments` | Repayments between two people, in cents |
| `saved_splits` | Read-only settle-up snapshots |
| `activity_log` | Written only by triggers |
| `group_invitations` | Pending and answered invitations |
| `friendships` | One row per pair: pending, accepted or declined |
| `invitation_updates` | A timestamp per account, used to refresh the UI |
| `profiles` | Display name, @username, photo, deletion status |

## Example flow: sharing a group

1. The owner types an @username. `add_person_by_username()` creates the person and a pending invitation in one transaction.
2. The invitee's app receives a realtime signal and shows the invitation in the bell.
3. Accepting calls `accept_invitation()`, which links the account to that person and creates the membership.
4. Every later change writes to `activity_log`, and realtime delivers it only to members.