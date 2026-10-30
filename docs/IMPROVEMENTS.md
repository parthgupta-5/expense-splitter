# Future improvements

Known limitations, and what I would build next, in rough priority order.

## Planned features

- **Expense dates:** record when a cost happened, not just when it was entered.
- **Undo for deletes:** a short undo window for removed expenses and groups.
- **Search:** find expenses by name, person or amount.
- **Settle-up summary:** a printable or PDF version.
- **Spending summary:** totals by category and by person.
- **Ownership transfer:** hand a group to another member.
- **Receipt photos:** attach a picture to an expense.

## Known limitations

- **Owner deletion:** an owner must delete a shared group before deleting their account, because there is no ownership transfer yet.
- **Invitation emails:** adding someone by username needs them to have an account already. No invitation emails are sent.
- **Simultaneous edits:** if two members edit the same expense at the same moment, the later save wins. Different expenses never conflict.
- **Mixed currencies:** each group has one currency, with no conversion.
- **Offline changes:** signed-in changes need a connection and are refused offline rather than queued.
- **Notifications:** no push or email notifications outside the app.