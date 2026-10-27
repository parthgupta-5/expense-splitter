import { describe, expect, it } from 'vitest';
import {
  MAX_CENTS, centsToDecimal, isCents, legacyAmountToCents, parseMoneyInput, sumCents,
} from './money';
import { formatCents } from './currency';

describe('parseMoneyInput', () => {
  it.each([
    ['300', 30000], ['10.5', 1050], ['10.55', 1055], ['0.29', 29], ['1.10', 110], ['.75', 75], ['12.', 1200],
    ['  42  ', 4200], ['007.50', 750], ['999999999999.99', MAX_CENTS],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseMoneyInput(text)).toEqual({ cents });
  });

  it('rejects more than two decimal places instead of rounding', () => {
    expect(parseMoneyInput('10.555')).toEqual({ error: 'Use at most 2 decimal places' });
    expect(parseMoneyInput('1.005')).toEqual({ error: 'Use at most 2 decimal places' });
    expect(parseMoneyInput('0.001')).toEqual({ error: 'Use at most 2 decimal places' });
  });

  it.each(['', '   ', '.', 'abc', '-5', '+5', '1e3', '1,000', '10,50', '1.2.3', '١٢', 'Infinity', '0x10'])(
    'rejects %j with a format message',
    (text) => {
      expect(parseMoneyInput(text).error).toBe('Enter an amount like 120 or 120.50');
    },
  );

  it('rejects zero unless allowed (custom amounts may be zero)', () => {
    expect(parseMoneyInput('0').error).toBe('Enter an amount greater than 0');
    expect(parseMoneyInput('0.00').error).toBe('Enter an amount greater than 0');
    expect(parseMoneyInput('0', { allowZero: true })).toEqual({ cents: 0 });
  });

  it('rejects amounts the database cannot store', () => {
    expect(parseMoneyInput('1000000000000').error).toBe('That amount is too large');
    expect(parseMoneyInput('0000000000001').cents).toBe(100);
  });

  it('never produces fractional cents, even for values floats cannot represent', () => {
    // 0.29 * 100 is 28.999999999999996 in floating point; string parsing gives exactly 29.
    expect(0.29 * 100).not.toBe(29);
    for (let cents = 0; cents < 2000; cents += 1) {
      expect(parseMoneyInput(centsToDecimal(cents), { allowZero: true }).cents).toBe(cents);
    }
  });
});

describe('centsToDecimal', () => {
  it('writes exact two-decimal strings for fields and formatting', () => {
    expect(centsToDecimal(0)).toBe('0.00');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(1055)).toBe('10.55');
    expect(centsToDecimal(-150)).toBe('-1.50');
    expect(centsToDecimal(MAX_CENTS)).toBe('999999999999.99');
  });
});

describe('formatCents', () => {
  it('formats cents as currency without passing through a float', () => {
    expect(formatCents(15000, 'INR')).toBe('₹150.00');
    expect(formatCents(-527, 'INR')).toBe('-₹5.27');
    expect(formatCents(MAX_CENTS, 'INR')).toBe('₹9,99,99,99,99,999.99');
    expect(formatCents(undefined, 'INR')).toBe('₹0.00');
  });
});

describe('helpers', () => {
  it('sums cents and recognises them', () => {
    expect(sumCents([10, 20, undefined, 0.5])).toBe(30);
    expect(isCents(0)).toBe(true);
    expect(isCents(10.5)).toBe(false);
    expect(isCents(-1)).toBe(false);
  });
  it('converts v2.0 decimal amounts once, when old data is read', () => {
    expect(legacyAmountToCents(100.1)).toBe(10010);
    expect(legacyAmountToCents('33.34')).toBe(3334);
    expect(legacyAmountToCents(0.1 + 0.2)).toBe(30);
    expect(legacyAmountToCents('abc')).toBeNull();
    expect(legacyAmountToCents(null)).toBeNull();
  });
});
