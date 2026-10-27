// Pure money logic for Expense Splitter. No React or browser APIs, so it is unit-tested.
// Every amount here is integer cents, so the parts of a split always add up exactly to the total.
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const wholeCents = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);

/**
 * Largest-remainder allocation: splits `totalCents` in proportion to `weights`
 * and guarantees the returned integers sum to exactly `totalCents`.
 */
export function allocateCents(totalCents, weights) {
  const clean = weights.map((w) => Math.max(0, num(w)));
  const weightSum = clean.reduce((a, b) => a + b, 0);
  if (!clean.length || weightSum <= 0) return clean.map(() => 0);
  const exact = clean.map((w) => (totalCents * w) / weightSum);
  const parts = exact.map(Math.floor);
  let left = totalCents - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value), weighted: clean[index] > 0 }))
    .filter((item) => item.weighted)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; left > 0 && order.length; i = (i + 1) % order.length, left -= 1) parts[order[i].index] += 1;
  return parts;
}

/**
 * Splits `totalCents` between `people` (the participants) by: equal | unequal | percentages | shares.
 * `values` holds each person's custom amount in cents (unequal), percentage, or share weight.
 * Returns { name: cents }.
 */
export function computeSplit(splitType, totalCents, people, values = {}) {
  if (!people.length) return {};
  let cents;
  if (splitType === 'equal') cents = allocateCents(totalCents, people.map(() => 1));
  else if (splitType === 'unequal') cents = people.map((p) => wholeCents(values[p]));
  else cents = allocateCents(totalCents, people.map((p) => num(values[p])));
  return Object.fromEntries(people.map((p, i) => [p, cents[i]]));
}

/** Returns an error message when the split inputs are inconsistent, otherwise null. */
export function validateSplit(splitType, totalCents, people, values = {}) {
  if (!people.length) return 'Choose at least one person to split between';
  if (splitType === 'unequal') {
    const sum = people.reduce((total, p) => total + wholeCents(values[p]), 0);
    if (sum !== totalCents) return 'Split amounts must add up to the expense total';
  }
  if (splitType === 'percentages') {
    const hundredths = people.reduce((total, p) => total + Math.round(num(values[p]) * 100), 0);
    if (hundredths !== 10000) return 'Percentages must add up to 100%';
  }
  if (splitType === 'shares') {
    const shares = people.reduce((total, p) => total + num(values[p]), 0);
    if (shares <= 0) return 'Enter at least one share';
  }
  return null;
}

/** Net position per person in cents: positive balance = is owed money, negative = owes money. */
export function computeBalances(people, expenses, payments) {
  const blank = () => ({ paidCents: 0, shareCents: 0, balanceCents: 0 });
  const result = Object.fromEntries(people.map((name) => [name, blank()]));
  const add = (name, key, cents) => { (result[name] ??= blank())[key] += cents; };
  expenses.forEach(({ payer, amountCents, splitCents = {} }) => {
    add(payer, 'paidCents', amountCents);
    add(payer, 'balanceCents', amountCents);
    Object.entries(splitCents).forEach(([name, share]) => {
      add(name, 'shareCents', share);
      add(name, 'balanceCents', -share);
    });
  });
  payments.forEach(({ payer, payee, amountCents }) => {
    add(payer, 'paidCents', amountCents);
    add(payer, 'balanceCents', amountCents);
    add(payee, 'balanceCents', -amountCents);
  });
  return result;
}

/**
 * Greedy minimal-transfer plan: repeatedly match the largest debtor with the largest creditor.
 * Balances are exact cents, so anyone not at exactly zero (even one paisa) is part of the plan.
 */
export function computeSettlements(balances) {
  const side = (sign) => Object.entries(balances)
    .filter(([, v]) => sign * v.balanceCents > 0)
    .map(([name, v]) => ({ name, cents: sign * v.balanceCents }))
    .sort((a, b) => b.cents - a.cents);
  const creditors = side(1);
  const debtors = side(-1);
  const result = [];
  while (creditors.length && debtors.length) {
    const cents = Math.min(creditors[0].cents, debtors[0].cents);
    result.push({ payer: debtors[0].name, payee: creditors[0].name, amountCents: cents });
    creditors[0].cents -= cents;
    debtors[0].cents -= cents;
    if (creditors[0].cents <= 0) creditors.shift();
    if (debtors[0].cents <= 0) debtors.shift();
  }
  return result;
}

/** True when `amountCents` is more than the payer currently owes / the payee is owed, so it would flip a balance. */
export function paymentExceedsOwed(balances, payer, payee, amountCents) {
  const owes = Math.max(0, -(balances[payer]?.balanceCents ?? 0));
  const owed = Math.max(0, balances[payee]?.balanceCents ?? 0);
  return amountCents > Math.min(owes, owed);
}
