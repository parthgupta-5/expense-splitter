import { describe, expect, it } from 'vitest';
import { balanceText, settlementSummary } from './settlementText';

const money = (cents) => '₹' + (cents / 100).toFixed(2);
const pay = (payer, payee, amountCents) => ({ payer, payee, amountCents });

describe('balanceText', () => {
  it('says who is owed, who owes and who is settled, without relying on a sign', () => {
    expect(balanceText(30000, money)).toBe('Is owed ₹300.00');
    expect(balanceText(-15000, money)).toBe('Owes ₹150.00');
    expect(balanceText(0, money)).toBe('Settled');
  });
});

describe('settlementSummary', () => {
  it('says when everyone is settled', () => {
    expect(settlementSummary([], 'Asha', money)).toEqual({ headline: 'All settled', detail: 'Nobody owes anything' });
    expect(settlementSummary([], null, money).headline).toBe('All settled');
  });

  it('speaks to the signed-in person when they owe or are owed', () => {
    const plan = [pay('Ben', 'Asha', 105000), pay('Chitra', 'Dev', 500)];
    expect(settlementSummary(plan, 'Asha', money)).toEqual({ headline: 'Ben owes you ₹1050.00', detail: '2 payments in the plan' });
    expect(settlementSummary(plan, 'Ben', money)).toEqual({ headline: 'You owe Asha ₹1050.00', detail: '2 payments in the plan' });
    expect(settlementSummary(plan, 'Eve', money)).toEqual({ headline: 'You are settled up', detail: '2 payments left between others' });
  });

  it('adds up several payments to or from the signed-in person', () => {
    expect(settlementSummary([pay('Ben', 'Asha', 300), pay('Chitra', 'Asha', 200)], 'Asha', money))
      .toEqual({ headline: 'You are owed ₹5.00', detail: 'By Ben and Chitra' });
    expect(settlementSummary([pay('Asha', 'Ben', 300), pay('Asha', 'Chitra', 200), pay('Asha', 'Dev', 100)], 'Asha', money))
      .toEqual({ headline: 'You owe ₹6.00', detail: 'To Ben, Chitra and Dev' });
  });

  it('names the people involved when nobody in the plan is the viewer (guest groups)', () => {
    expect(settlementSummary([pay('Ben', 'Asha', 15000)], null, money))
      .toEqual({ headline: 'Ben owes Asha ₹150.00', detail: '1 payment in the plan' });
    expect(settlementSummary([pay('Ben', 'Asha', 100), pay('Chitra', 'Asha', 100), pay('Ben', 'Dev', 100)], null, money))
      .toEqual({ headline: '3 payments to settle', detail: 'Ben and Chitra owe money' });
  });
});
