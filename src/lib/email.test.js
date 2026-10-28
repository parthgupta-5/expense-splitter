import { describe, expect, it } from 'vitest';
import { maskEmail } from './email';

describe('maskEmail', () => {
  it('keeps the first character and the domain, and hides the rest', () => {
    expect(maskEmail('asha@example.com')).toBe('a•••@example.com');
    expect(maskEmail('a@example.com')).toBe('a•••@example.com');
    expect(maskEmail('first.last+tag@mail.example.co.uk')).toBe('f•••@mail.example.co.uk');
  });

  it('never shows an address it cannot split', () => {
    expect(maskEmail('not-an-address')).toBe('•••');
    expect(maskEmail('@example.com')).toBe('•••');
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
  });
});
