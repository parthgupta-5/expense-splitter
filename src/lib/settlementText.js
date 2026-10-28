// Who owes whom, in words. The group page uses these so it never relies on a +/− sign or a colour alone.
import { listNames } from './people';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One person's net balance: "Is owed ₹300.00", "Owes ₹150.00" or "Settled". */
export function balanceText(balanceCents, money) {
  if (balanceCents > 0) return 'Is owed ' + money(balanceCents);
  if (balanceCents < 0) return 'Owes ' + money(-balanceCents);
  return 'Settled';
}

/**
 * The group page's "To settle" summary, as { headline, detail }. `settlements` is the suggested plan
 * (computeSettlements); `me` is the signed-in user's own person in this group, or null (guest groups, or an owner who
 * is not in the expenses). A person is only ever on one side of the plan: they either pay or are paid.
 */
export function settlementSummary(settlements, me, money) {
  const count = settlements.length;
  if (!count) return { headline: 'All settled', detail: 'Nobody owes anything' };
  const inPlan = plural(count, 'payment') + ' in the plan';
  const total = (items) => money(items.reduce((sum, item) => sum + item.amountCents, 0));

  if (me) {
    const paying = settlements.filter((item) => item.payer === me);
    const paid = settlements.filter((item) => item.payee === me);
    if (paying.length === 1) return { headline: `You owe ${paying[0].payee} ${money(paying[0].amountCents)}`, detail: inPlan };
    if (paying.length > 1) return { headline: `You owe ${total(paying)}`, detail: 'To ' + listNames(paying.map((item) => item.payee)) };
    if (paid.length === 1) return { headline: `${paid[0].payer} owes you ${money(paid[0].amountCents)}`, detail: inPlan };
    if (paid.length > 1) return { headline: `You are owed ${total(paid)}`, detail: 'By ' + listNames(paid.map((item) => item.payer)) };
    return { headline: 'You are settled up', detail: plural(count, 'payment') + ' left between others' };
  }

  if (count === 1) {
    const [only] = settlements;
    return { headline: `${only.payer} owes ${only.payee} ${money(only.amountCents)}`, detail: inPlan };
  }
  const payers = [...new Set(settlements.map((item) => item.payer))];
  return { headline: plural(count, 'payment') + ' to settle', detail: `${listNames(payers)} ${payers.length === 1 ? 'owes' : 'owe'} money` };
}
