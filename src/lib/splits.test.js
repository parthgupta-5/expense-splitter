import { describe, expect, it } from 'vitest';
import {
  allocateCents, computeBalances, computeSettlements, computeSplit, paymentExceedsOwed, validateSplit,
} from './splits';

// Every amount in these tests is integer cents.
const people = ['Asha', 'Ben', 'Chitra'];
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const allIntegers = (obj) => Object.values(obj).every(Number.isSafeInteger);

describe('computeSplit', () => {
  it('equal split always adds up to the total, remainder goes to the first person', () => {
    const split = computeSplit('equal', 10000, people);
    expect(sum(split)).toBe(10000);
    expect(split).toEqual({ Asha: 3334, Ben: 3333, Chitra: 3333 });
  });
  it('percentages and shares scale to the amount', () => {
    expect(computeSplit('percentages', 20000, people, { Asha: 50, Ben: 30, Chitra: 20 })).toEqual({ Asha: 10000, Ben: 6000, Chitra: 4000 });
    expect(computeSplit('shares', 9000, people, { Asha: 1, Ben: 2, Chitra: 0 })).toEqual({ Asha: 3000, Ben: 6000, Chitra: 0 });
  });
  it('custom amounts are taken as given, in cents', () => {
    expect(computeSplit('unequal', 1055, ['Asha', 'Ben'], { Asha: 1000, Ben: 55 })).toEqual({ Asha: 1000, Ben: 55 });
  });
  it('returns an empty split for an empty group', () => {
    expect(computeSplit('equal', 5000, [])).toEqual({});
  });
});

describe('validateSplit', () => {
  it('rejects inconsistent inputs and accepts valid ones', () => {
    expect(validateSplit('unequal', 10000, people, { Asha: 1000, Ben: 1000 })).toMatch(/add up/);
    expect(validateSplit('percentages', 10000, people, { Asha: 50, Ben: 40 })).toMatch(/100%/);
    expect(validateSplit('shares', 10000, people, {})).toMatch(/share/);
    expect(validateSplit('percentages', 10000, people, { Asha: 50, Ben: 30, Chitra: 20 })).toBeNull();
    expect(validateSplit('equal', 10000, [])).toMatch(/at least one person/);
  });
  it('never accepts fractional cents as custom amounts', () => {
    expect(validateSplit('unequal', 100, ['Asha', 'Ben'], { Asha: 50.5, Ben: 49.5 })).toMatch(/add up/);
  });
});

describe('balances and settlements', () => {
  const expenses = [
    { payer: 'Asha', amountCents: 30000, splitCents: computeSplit('equal', 30000, people) },
    { payer: 'Ben', amountCents: 9000, splitCents: computeSplit('equal', 9000, people) },
  ];

  it('balances net to zero across the group, in whole cents', () => {
    const balances = computeBalances(people, expenses, []);
    expect(Object.values(balances).reduce((s, b) => s + b.balanceCents, 0)).toBe(0);
    expect(balances.Asha.balanceCents).toBe(17000);
    expect(balances.Chitra.balanceCents).toBe(-13000);
    Object.values(balances).forEach((b) => expect(allIntegers(b)).toBe(true));
  });

  it('settlement plan clears every balance with at most N−1 transfers', () => {
    const balances = computeBalances(people, expenses, []);
    const plan = computeSettlements(balances);
    expect(plan.length).toBeLessThanOrEqual(people.length - 1);
    const after = computeBalances(people, expenses, plan);
    Object.values(after).forEach((b) => expect(b.balanceCents).toBe(0));
  });

  it('recorded repayments reduce what is owed', () => {
    const balances = computeBalances(people, expenses, [{ payer: 'Chitra', payee: 'Asha', amountCents: 13000 }]);
    expect(balances.Chitra.balanceCents).toBe(0);
    expect(computeSettlements(balances).every((t) => t.payee !== 'Asha' || t.amountCents <= 4000)).toBe(true);
  });

  it('is settled when there are no expenses', () => {
    expect(computeSettlements(computeBalances(people, [], []))).toEqual([]);
  });

  it('is settled only at exactly zero: a one-paisa balance still needs a payment', () => {
    // 1.00 split three ways is 34/33/33; Ben and Chitra repay 33 and 32, leaving Chitra one paisa short.
    const oneRupee = [{ payer: 'Asha', amountCents: 100, splitCents: computeSplit('equal', 100, people) }];
    const repaid = [
      { payer: 'Ben', payee: 'Asha', amountCents: 33 },
      { payer: 'Chitra', payee: 'Asha', amountCents: 32 },
    ];
    const balances = computeBalances(people, oneRupee, repaid);
    expect(balances.Chitra.balanceCents).toBe(-1);
    expect(balances.Asha.balanceCents).toBe(1);
    expect(computeSettlements(balances)).toEqual([{ payer: 'Chitra', payee: 'Asha', amountCents: 1 }]);
    const settled = computeBalances(people, oneRupee, [...repaid, { payer: 'Chitra', payee: 'Asha', amountCents: 1 }]);
    expect(computeSettlements(settled)).toEqual([]);
    Object.values(settled).forEach((b) => expect(b.balanceCents).toBe(0));
  });

  it('tolerates people who appear in expenses but were removed from the group', () => {
    const balances = computeBalances(['Asha'], [{ payer: 'Zed', amountCents: 1000, splitCents: { Asha: 1000 } }], []);
    expect(balances.Zed.balanceCents).toBe(1000);
  });
});

describe('exact-cent splitting', () => {
  it('100 split by shares 1:1:1 sums to exactly 100', () => {
    expect(sum(computeSplit('shares', 10000, people, { Asha: 1, Ben: 1, Chitra: 1 }))).toBe(10000);
  });
  it('historical fractional share weights still split exactly', () => {
    const split = computeSplit('shares', 10000, people, { Asha: 0.333, Ben: 1.5, Chitra: 2.25 });
    expect(sum(split)).toBe(10000);
    expect(allIntegers(split)).toBe(true);
  });
  it('percentages 33.33/33.33/33.34 sum exactly and validate', () => {
    const values = { Asha: 33.33, Ben: 33.33, Chitra: 33.34 };
    expect(validateSplit('percentages', 10000, people, values)).toBeNull();
    expect(computeSplit('percentages', 10000, people, values)).toEqual({ Asha: 3333, Ben: 3333, Chitra: 3334 });
  });
  it('handles the smallest and the largest amount', () => {
    expect(computeSplit('equal', 1, people)).toEqual({ Asha: 1, Ben: 0, Chitra: 0 });
    const largest = 99999999999999;
    const split = computeSplit('equal', largest, people);
    expect(sum(split)).toBe(largest);
    expect(allIntegers(split)).toBe(true);
  });
  it('custom amounts are compared in whole cents with no tolerance', () => {
    expect(validateSplit('unequal', 10000, people, { Asha: 3333, Ben: 3333, Chitra: 3333 })).toMatch(/add up/);
    expect(validateSplit('unequal', 10000, people, { Asha: 3333, Ben: 3333, Chitra: 3334 })).toBeNull();
  });
  it('every split type sums exactly to the total for many random inputs', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 300; i += 1) {
      const totalCents = Math.round(rand() * 5000000) + 1;
      const n = 1 + Math.floor(rand() * 6);
      const group = Array.from({ length: n }, (_, k) => 'P' + k);
      const weights = Object.fromEntries(group.map((p) => [p, Math.round(rand() * 900) / 100 + 0.01]));
      ['equal', 'shares', 'percentages'].forEach((type) => {
        const split = computeSplit(type, totalCents, group, weights);
        expect(sum(split)).toBe(totalCents);
        expect(allIntegers(split)).toBe(true);
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
    const split = computeSplit('equal', 9000, ['Asha', 'Ben']);
    expect(split).toEqual({ Asha: 4500, Ben: 4500 });
    const balances = computeBalances(people, [{ payer: 'Asha', amountCents: 9000, splitCents: split }], []);
    expect(balances.Chitra).toEqual({ paidCents: 0, shareCents: 0, balanceCents: 0 });
    expect(balances.Ben.balanceCents).toBe(-4500);
    expect(computeSettlements(balances)).toEqual([{ payer: 'Ben', payee: 'Asha', amountCents: 4500 }]);
  });
  it('percentages and shares only involve the chosen people', () => {
    expect(computeSplit('percentages', 10000, ['Asha', 'Ben'], { Asha: 70, Ben: 30, Chitra: 99 })).toEqual({ Asha: 7000, Ben: 3000 });
    expect(computeSplit('shares', 9000, ['Ben', 'Chitra'], { Asha: 5, Ben: 1, Chitra: 2 })).toEqual({ Ben: 3000, Chitra: 6000 });
  });
  it('custom amounts ignore people who are not taking part and need at least one person', () => {
    expect(validateSplit('unequal', 5000, ['Asha', 'Ben'], { Asha: 2000, Ben: 3000, Chitra: 10000 })).toBeNull();
    expect(validateSplit('equal', 5000, [])).toMatch(/at least one person/);
  });
});

describe('paymentExceedsOwed', () => {
  const balances = { Asha: { balanceCents: 10000 }, Ben: { balanceCents: -6000 }, Chitra: { balanceCents: -4000 } };
  it('flags payments above what is owed and allows exact or smaller ones', () => {
    expect(paymentExceedsOwed(balances, 'Ben', 'Asha', 6000)).toBe(false);
    expect(paymentExceedsOwed(balances, 'Ben', 'Asha', 6001)).toBe(true);
    expect(paymentExceedsOwed(balances, 'Chitra', 'Asha', 1000)).toBe(false);
  });
  it('flags a payment from someone who owes nothing', () => {
    expect(paymentExceedsOwed(balances, 'Asha', 'Ben', 500)).toBe(true);
  });
});

describe('settlement plan on random groups', () => {
  it('balances sum to zero and the plan clears everyone with at most N-1 transfers', () => {
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let round = 0; round < 200; round += 1) {
      const n = 2 + Math.floor(rand() * 6);
      const group = Array.from({ length: n }, (_, k) => 'P' + k);
      const expenses = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => {
        const amountCents = Math.round(rand() * 100000) + 1;
        const members = group.filter(() => rand() > 0.3);
        const chosen = members.length ? members : [group[0]];
        return { payer: group[Math.floor(rand() * n)], amountCents, splitCents: computeSplit('equal', amountCents, chosen) };
      });
      const balances = computeBalances(group, expenses, []);
      expect(Object.values(balances).reduce((s, b) => s + b.balanceCents, 0)).toBe(0);
      const plan = computeSettlements(balances);
      expect(plan.length).toBeLessThanOrEqual(n - 1);
      const after = computeBalances(group, expenses, plan);
      Object.values(after).forEach((b) => expect(b.balanceCents).toBe(0));
    }
  });
});
