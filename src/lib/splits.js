// Pure money logic for Expense Splitter. No React or browser APIs, so it is unit-tested.
// All splitting is done in integer cents, so the parts always add up exactly to the total.
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const SETTLE_EPSILON = 0.01;

export const toCents = (amount) => Math.round(num(amount) * 100);
export const fromCents = (cents) => cents / 100;

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

/** Split `amount` between `people` (the participants) by: equal | unequal | percentages | shares. */
export function computeSplit(splitType, amount, people, values = {}) {
  if (!people.length) return {};
  const total = toCents(amount);
  let cents;
  if (splitType === 'equal') cents = allocateCents(total, people.map(() => 1));
  else if (splitType === 'unequal') cents = people.map((p) => toCents(values[p]));
  else cents = allocateCents(total, people.map((p) => num(values[p])));
  return Object.fromEntries(people.map((p, i) => [p, fromCents(cents[i])]));
}

/** Returns an error message when the split inputs are inconsistent, otherwise null. */
export function validateSplit(splitType, amount, people, values = {}) {
  if (!people.length) return 'Choose at least one person to split between';
  if (splitType === 'unequal') {
    const sum = people.reduce((total, p) => total + toCents(values[p]), 0);
    if (sum !== toCents(amount)) return 'Split amounts must add up to the expense total';
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

/** Net position per person: positive = is owed money, negative = owes money. */
export function computeBalances(people, expenses, payments) {
  const result = Object.fromEntries(people.map((name) => [name, { paid: 0, share: 0, balance: 0 }]));
  const entry = (name) => (result[name] ??= { paid: 0, share: 0, balance: 0 });
  const add = (name, key, cents) => {
    entry(name)[key] = fromCents(toCents(entry(name)[key]) + cents);
  };
  const addBalance = (name, cents) => add(name, 'balance', cents);
  expenses.forEach(({ payer, amount, splitDetails = {} }) => {
    add(payer, 'paid', toCents(amount));
    addBalance(payer, toCents(amount));
    Object.entries(splitDetails).forEach(([name, share]) => {
      add(name, 'share', toCents(share));
      addBalance(name, -toCents(share));
    });
  });
  payments.forEach(({ payer, payee, amount }) => {
    add(payer, 'paid', toCents(amount));
    addBalance(payer, toCents(amount));
    addBalance(payee, -toCents(amount));
  });
  return result;
}

/** Greedy minimal-transfer plan: repeatedly match the largest debtor with the largest creditor. */
export function computeSettlements(balances) {
  const side = (sign) => Object.entries(balances)
    .filter(([, v]) => sign * v.balance > SETTLE_EPSILON)
    .map(([name, v]) => ({ name, cents: sign * toCents(v.balance) }))
    .sort((a, b) => b.cents - a.cents);
  const creditors = side(1);
  const debtors = side(-1);
  const result = [];
  while (creditors.length && debtors.length) {
    const cents = Math.min(creditors[0].cents, debtors[0].cents);
    result.push({ payer: debtors[0].name, payee: creditors[0].name, amount: fromCents(cents) });
    creditors[0].cents -= cents;
    debtors[0].cents -= cents;
    if (creditors[0].cents <= 0) creditors.shift();
    if (debtors[0].cents <= 0) debtors.shift();
  }
  return result;
}

/** True when `amount` is more than the payer currently owes / the payee is owed, so it would flip a balance. */
export function paymentExceedsOwed(balances, payer, payee, amount) {
  const owes = Math.max(0, -(balances[payer]?.balance ?? 0));
  const owed = Math.max(0, balances[payee]?.balance ?? 0);
  return toCents(amount) > toCents(Math.min(owes, owed));
}
