import { describe, expect, it } from 'vitest';
import { describeRejected, parseNames, removalStatus } from './people';

describe('parseNames', () => {
  it('rejects case-insensitive and whitespace-padded duplicates', () => {
    expect(parseNames('asha ', ['Asha']).duplicates).toEqual(['asha']);
  });
  it('adds the valid names from a list and reports the rest', () => {
    const r = parseNames('Ben, asha, Chitra, Ben', ['Asha']);
    expect(r.valid).toEqual(['Ben', 'Chitra']);
    expect(r.duplicates).toEqual(['asha', 'Ben']);
    expect(describeRejected(r)).toMatch(/already in the list/);
  });
  it('rejects over-long names and ignores empty entries', () => {
    const r = parseNames(',,' + 'x'.repeat(41) + ', Ok');
    expect(r.tooLong).toHaveLength(1);
    expect(r.valid).toEqual(['Ok']);
  });
});

describe('removalStatus', () => {
  const balances = { Asha: { balance: 30 }, Ben: { balance: 0 }, Chitra: { balance: 0 } };
  const expenses = [{ payer: 'Ben', amount: 10, splitDetails: { Ben: 10 } }];
  it('blocks people with a balance, confirms people with history, frees the rest', () => {
    expect(removalStatus('Asha', balances, expenses, [])).toBe('blocked');
    expect(removalStatus('Ben', balances, expenses, [])).toBe('confirm');
    expect(removalStatus('Chitra', balances, expenses, [])).toBe('free');
  });
});
