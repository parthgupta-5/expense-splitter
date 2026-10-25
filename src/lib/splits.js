// Pure money logic for Expense Splitter. No React or browser APIs, so it is unit-tested.
const round2 = (value) => Math.round(value * 100) / 100;
const num = (value) => Number(value) || 0;

export const SETTLE_EPSILON = 0.01;

/** Split `amount` between `people` using one of: equal | unequal | percentages | shares. */
export function computeSplit(splitType, amount, people, values = {}) {
  if (!people.length) return {};
  if (splitType === 'equal') {
    const each = Math.floor((amount / people.length) * 100) / 100;
    const split = Object.fromEntries(people.map((person) => [person, each]));
    split[people[0]] = round2(split[people[0]] + amount - each * people.length);
    return split;
  }
  if (splitType === 'unequal') return Object.fromEntries(people.map((p) => [p, num(values[p])]));
  if (splitType === 'percentages') {
    return Object.fromEntries(people.map((p) => [p, (amount * num(values[p])) / 100]));
  }
  const totalShares = people.reduce((sum, p) => sum + num(values[p]), 0);
  return Object.fromEntries(people.map((p) => [p, totalShares ? (amount * num(values[p])) / totalShares : 0]));
}

/** Returns an error message when the split inputs are inconsistent, otherwise null. */
export function validateSplit(splitType, amount, people, values = {}) {
  if (!people.length) return 'Add at least one person to the group first';
  const sum = people.reduce((total, p) => total + num(values[p]), 0);
  if (splitType === 'unequal' && Math.abs(sum - amount) > SETTLE_EPSILON) return 'Split amounts must add up to the expense total';
  if (splitType === 'percentages' && Math.abs(sum - 100) > SETTLE_EPSILON) return 'Percentages must add up to 100%';
  if (splitType === 'shares' && sum <= 0) return 'Enter at least one share';
  return null;
}

/** Net position per person: positive = is owed money, negative = owes money. */
export function computeBalances(people, expenses, payments) {
  const result = Object.fromEntries(people.map((name) => [name, { paid: 0, share: 0, balance: 0 }]));
  const entry = (name) => (result[name] ??= { paid: 0, share: 0, balance: 0 });
  expenses.forEach(({ payer, amount, splitDetails = {} }) => {
    const paid = num(amount);
    entry(payer).paid += paid;
    entry(payer).balance += paid;
    Object.entries(splitDetails).forEach(([name, share]) => {
      entry(name).share += num(share);
      entry(name).balance -= num(share);
    });
  });
  payments.forEach(({ payer, payee, amount }) => {
    const paid = num(amount);
    entry(payer).paid += paid;
    entry(payer).balance += paid;
    entry(payee).balance -= paid;
  });
  return result;
}

/** Greedy minimal-transfer plan: repeatedly match the largest debtor with the largest creditor. */
export function computeSettlements(balances) {
  const side = (sign) => Object.entries(balances)
    .filter(([, v]) => sign * v.balance > SETTLE_EPSILON)
    .map(([name, v]) => ({ name, amount: sign * v.balance }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = side(1);
  const debtors = side(-1);
  const result = [];
  while (creditors.length && debtors.length) {
    const amount = Math.min(creditors[0].amount, debtors[0].amount);
    result.push({ payer: debtors[0].name, payee: creditors[0].name, amount: round2(amount) });
    creditors[0].amount -= amount;
    debtors[0].amount -= amount;
    if (creditors[0].amount <= SETTLE_EPSILON) creditors.shift();
    if (debtors[0].amount <= SETTLE_EPSILON) debtors.shift();
  }
  return result;
}
