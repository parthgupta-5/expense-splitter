import { describe, expect, it } from 'vitest';
import { computeBalances, computeSettlements, computeSplit, validateSplit } from './splits';

const people = ['Asha', 'Ben', 'Chitra'];
const sum = (obj) => Math.round(Object.values(obj).reduce((a, b) => a + b, 0) * 100) / 100;

describe('computeSplit', () => {
  it('equal split always adds up to the total, remainder goes to the first person', () => {
    const split = computeSplit('equal', 100, people);
    expect(sum(split)).toBe(100);
    expect(split.Asha).toBe(33.34);
    expect(split.Ben).toBe(33.33);
  });
  it('percentages and shares scale to the amount', () => {
    expect(computeSplit('percentages', 200, people, { Asha: 50, Ben: 30, Chitra: 20 })).toEqual({ Asha: 100, Ben: 60, Chitra: 40 });
    expect(computeSplit('shares', 90, people, { Asha: 1, Ben: 2, Chitra: 0 })).toEqual({ Asha: 30, Ben: 60, Chitra: 0 });
  });
  it('returns an empty split for an empty group', () => {
    expect(computeSplit('equal', 50, [])).toEqual({});
  });
});

describe('validateSplit', () => {
  it('rejects inconsistent inputs and accepts valid ones', () => {
    expect(validateSplit('unequal', 100, people, { Asha: 10, Ben: 10 })).toMatch(/add up/);
    expect(validateSplit('percentages', 100, people, { Asha: 50, Ben: 40 })).toMatch(/100%/);
    expect(validateSplit('shares', 100, people, {})).toMatch(/share/);
    expect(validateSplit('percentages', 100, people, { Asha: 50, Ben: 30, Chitra: 20 })).toBeNull();
    expect(validateSplit('equal', 100, [])).toMatch(/at least one person/);
  });
});

describe('balances and settlements', () => {
  const expenses = [
    { payer: 'Asha', amount: 300, splitDetails: computeSplit('equal', 300, people) },
    { payer: 'Ben', amount: 90, splitDetails: computeSplit('equal', 90, people) },
  ];

  it('balances net to zero across the group', () => {
    const balances = computeBalances(people, expenses, []);
    expect(Math.round(Object.values(balances).reduce((s, b) => s + b.balance, 0) * 100) / 100).toBe(0);
    expect(balances.Asha.balance).toBe(170);
    expect(balances.Chitra.balance).toBe(-130);
  });

  it('settlement plan clears every balance with the fewest transfers', () => {
    const balances = computeBalances(people, expenses, []);
    const plan = computeSettlements(balances);
    expect(plan.length).toBeLessThanOrEqual(people.length - 1);
    const after = computeBalances(people, expenses, plan);
    Object.values(after).forEach((b) => expect(Math.abs(b.balance)).toBeLessThan(0.02));
  });

  it('recorded repayments reduce what is owed', () => {
    const balances = computeBalances(people, expenses, [{ payer: 'Chitra', payee: 'Asha', amount: 130 }]);
    expect(balances.Chitra.balance).toBe(0);
    expect(computeSettlements(balances).every((t) => t.payee !== 'Asha' || t.amount <= 40)).toBe(true);
  });

  it('is settled when there are no expenses', () => {
    expect(computeSettlements(computeBalances(people, [], []))).toEqual([]);
  });

  it('tolerates people who appear in expenses but were removed from the group', () => {
    const balances = computeBalances(['Asha'], [{ payer: 'Zed', amount: 10, splitDetails: { Asha: 10 } }], []);
    expect(balances.Zed.balance).toBe(10);
  });
});
