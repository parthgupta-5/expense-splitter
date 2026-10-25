import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x', '\r=x'])('neutralises formula starter %j', (value) => {
    expect(csvCell(value).startsWith('"\'')).toBe(true);
  });
  it('quotes plain text and doubles inner quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('Dinner, drinks')).toBe('"Dinner, drinks"');
  });
  it('leaves numbers (including negatives) untouched', () => {
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3');
  });
  it('handles null and undefined', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe('toCsv', () => {
  it('joins rows and cells', () => {
    expect(toCsv([['a', 1], ['=b', 2]])).toBe('"a",1\n"\'=b",2');
  });
});
