// Turns server activity-log rows into readable sentences for the History page.
const quote = (text) => '“' + (text || 'Expense') + '”';

/**
 * @param entry  activity_log row: { action, actor_name, details, ... }
 * @param money  formats an amount in integer cents
 * @returns { text, kind } where kind is 'expense' | 'payment' | 'people' | 'group'
 */
export function describeActivity(entry, money) {
  const who = entry.actor_name || 'Someone';
  const d = entry.details || {};
  const amount = d.amount_cents === undefined ? '' : money(Number(d.amount_cents));
  switch (entry.action) {
    case 'expense_added': return { kind: 'expense', text: `${who} added ${quote(d.description)} · ${amount}, paid by ${d.payer}` };
    case 'expense_updated': return { kind: 'expense', text: `${who} edited ${quote(d.description)} · ${amount}` };
    case 'expense_deleted': return { kind: 'expense', text: `${who} deleted ${quote(d.description)} · ${amount}` };
    case 'payment_added': return { kind: 'payment', text: `${who} recorded ${d.payer} paying ${d.payee} ${amount}` };
    case 'payment_deleted': return { kind: 'payment', text: `${who} removed a ${amount} payment from ${d.payer} to ${d.payee}` };
    case 'person_added': return { kind: 'people', text: `${who} added ${d.name} to the group` };
    case 'person_removed': return { kind: 'people', text: `${who} removed ${d.name} from the group` };
    case 'member_joined':
      // Accepting a username invitation is done by the person joining, so they are also the actor.
      return d.user_id && d.user_id === entry.actor_id
        ? { kind: 'group', text: `${who} joined the group` }
        : { kind: 'group', text: `${d.name || 'A new member'} joined (invited by ${who})` };
    case 'member_left': return { kind: 'group', text: `${d.name || 'A member'} left the group` };
    case 'group_created': return { kind: 'group', text: `${who} created the group` };
    case 'group_imported': return { kind: 'group', text: `${who} moved this group from their device into their account` };
    case 'group_updated': return { kind: 'group', text: `${who} renamed the group to ${quote(d.name)} (${d.currency_code})` };
    case 'split_saved': return { kind: 'group', text: `${who} saved a split snapshot` };
    case 'split_deleted': return { kind: 'group', text: `${who} deleted a split snapshot` };
    default: return { kind: 'group', text: `${who}: ${entry.action}` };
  }
}
