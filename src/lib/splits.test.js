import { describe, expect, it } from 'vitest';
import { allocateCents, computeBalances, computeSettlements, computeSplit, paymentExceedsOwed, toCents, validateSplit } from './splits';

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

describe('exact-cent splitting', () => {
  it('3 people splitting 100 equally', () => {
    expect(computeSplit('equal', 100, people)).toEqual({ Asha: 33.34, Ben: 33.33, Chitra: 33.33 });
  });
  it('100 split by shares 1:1:1 sums to exactly 100', () => {
    const split = computeSplit('shares', 100, people, { Asha: 1, Ben: 1, Chitra: 1 });
    expect(toCents(sum(split))).toBe(10000);
  });
  it('percentages 33.33/33.33/33.34 sum exactly and validate', () => {
    const values = { Asha: 33.33, Ben: 33.33, Chitra: 33.34 };
    expect(validateSplit('percentages', 100, people, values)).toBeNull();
    expect(computeSplit('percentages', 100, people, values)).toEqual({ Asha: 33.33, Ben: 33.33, Chitra: 33.34 });
  });
  it('handles the smallest and a large amount', () => {
    expect(toCents(sum(computeSplit('equal', 0.01, people)))).toBe(1);
    expect(computeSplit('equal', 0.01, people)).toEqual({ Asha: 0.01, Ben: 0, Chitra: 0 });
    expect(toCents(sum(computeSplit('equal', 1000000, people)))).toBe(100000000);
  });
  it('custom amounts are compared in whole cents with no tolerance', () => {
    expect(validateSplit('unequal', 100, people, { Asha: 33.33, Ben: 33.33, Chitra: 33.33 })).toMatch(/add up/);
    expect(validateSplit('unequal', 100, people, { Asha: 33.33, Ben: 33.33, Chitra: 33.34 })).toBeNull();
  });
  it('every split type sums exactly to the total for many random inputs', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 300; i += 1) {
      const amount = Math.round(rand() * 5000000) / 100 + 0.01;
      const n = 1 + Math.floor(rand() * 6);
      const group = Array.from({ length: n }, (_, k) => 'P' + k);
      const weights = Object.fromEntries(group.map((p) => [p, Math.round(rand() * 900) / 100 + 0.01]));
      ['equal', 'shares', 'percentages'].forEach((type) => {
        expect(toCents(sum(computeSplit(type, amount, group, weights)))).toBe(toCents(amount));
      });
    }
  });
  it('allocateCents never goes negative and ignores zero weights', () => {
    expect(allocateCents(100, [1, 0, 1])).toEqual([50, 0, 50]);
    expect(allocateCents(5, [0, 0])).toEqual([0, 0]);
  });
});

describe('choosing participants', () => {
  it('equal split between 2 of 3 people gives 45/45/0 in balances', () => {
    const split = computeSplit('equal', 90, ['Asha', 'Ben']);
    expect(split).toEqual({ Asha: 45, Ben: 45 });
    const balances = computeBalances(people, [{ payer: 'Asha', amount: 90, splitDetails: split }], []);
    expect(balances.Chitra).toEqual({ paid: 0, share: 0, balance: 0 });
    expect(balances.Ben.balance).toBe(-45);
    expect(computeSettlements(balances)).toEqual([{ payer: 'Ben', payee: 'Asha', amount: 45 }]);
  });
  it('percentages and shares only involve the chosen people', () => {
    expect(computeSplit('percentages', 100, ['Asha', 'Ben'], { Asha: 70, Ben: 30, Chitra: 99 })).toEqual({ Asha: 70, Ben: 30 });
    expect(computeSplit('shares', 90, ['Ben', 'Chitra'], { Asha: 5, Ben: 1, Chitra: 2 })).toEqual({ Ben: 30, Chitra: 60 });
  });
  it('custom amounts ignore people who are not taking part and need at least one person', () => {
    expect(validateSplit('unequal', 50, ['Asha', 'Ben'], { Asha: 20, Ben: 30, Chitra: 100 })).toBeNull();
    expect(validateSplit('equal', 50, [])).toMatch(/at least one person/);
  });
});

describe('paymentExceedsOwed', () => {
  const balances = { Asha: { balance: 100 }, Ben: { balance: -60 }, Chitra: { balance: -40 } };
  it('flags payments above what is owed and allows exact or smaller ones', () => {
    expect(paymentExceedsOwed(balances, 'Ben', 'Asha', 60)).toBe(false);
    expect(paymentExceedsOwed(balances, 'Ben', 'Asha', 60.01)).toBe(true);
    expect(paymentExceedsOwed(balances, 'Chitra', 'Asha', 10)).toBe(false);
  });
  it('flags a payment from someone who owes nothing', () => {
    expect(paymentExceedsOwed(balances, 'Asha', 'Ben', 5)).toBe(true);
  });
});
