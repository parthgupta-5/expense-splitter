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
  const balances = { Asha: { balanceCents: 3000 }, Ben: { balanceCents: 0 }, Chitra: { balanceCents: 0 } };
  const expenses = [{ payer: 'Ben', amountCents: 1000, splitCents: { Ben: 1000 } }];
  it('blocks people with a balance, confirms people with history, frees the rest', () => {
    expect(removalStatus('Asha', balances, expenses, [])).toBe('blocked');
    expect(removalStatus('Ben', balances, expenses, [])).toBe('confirm');
    expect(removalStatus('Chitra', balances, expenses, [])).toBe('free');
  });
  it('blocks a one-paisa balance either way, like the database guard', () => {
    expect(removalStatus('Ben', { Ben: { balanceCents: 1 } }, expenses, [])).toBe('blocked');
    expect(removalStatus('Ben', { Ben: { balanceCents: -1 } }, expenses, [])).toBe('blocked');
    expect(removalStatus('Ben', { Ben: { balanceCents: 0 } }, expenses, [])).toBe('confirm');
  });
});
