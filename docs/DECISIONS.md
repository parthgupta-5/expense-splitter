# Engineering decisions

- **Money is integer cents.** Splits use the largest-remainder method, so shares always add up exactly. Decimals are only used for display.
- **Validation lives in the database.** A trigger rejects bad shares, unknown payers and fractional cents, even for a hand-made API call.
- **Balance maths is tested twice.** The SQL `group_balances()` is compared with the JavaScript `computeBalances()` on random groups.
- **One row per change.** Early versions stored a whole group as one JSON document, so simultaneous edits overwrote each other. Now each expense, payment and person is its own row.
- **Optimistic updates with rollback.** The screen updates at once. If the server rejects the write, the group is reloaded from the server.
- **Multi-step actions are transactions.** Adding someone by username creates the person and the invitation together, or neither.
- **One realtime channel.** Row Level Security decides what each user receives.
- **The bell is only for decisions.** History lives on its own Recent Activities page, so nothing is shown twice.
- **Friendship needs consent.** A request is not a friendship until it is accepted. A decline blocks new requests for 7 days.
- **Deletion is reversible for 7 days.** The account is switched off immediately but kept. Only a scheduled job with a secret deletes it for good.
- **Guest mode by design.** With no session, data stays in `localStorage` and the database is never called.