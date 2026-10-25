import { describe, expect, it } from 'vitest';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('explains network failures', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/internet connection/);
  });
  it('explains permission problems', () => {
    expect(friendlyError({ message: 'new row violates row-level security policy' })).toMatch(/permission/);
    expect(friendlyError({ code: '42501', message: 'x' })).toMatch(/permission/);
  });
  it('maps common auth errors', () => {
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.');
    expect(friendlyError({ message: 'User already registered' })).toMatch(/already exists/);
  });
  it('never leaks stack traces or very long messages', () => {
    expect(friendlyError({ message: 'boom\n    at fn (file.js:1:1)' })).toBe('Something went wrong. Please try again.');
    expect(friendlyError({ message: 'x'.repeat(300) }, 'fallback')).toBe('fallback');
    expect(friendlyError(undefined)).toBe('Something went wrong. Please try again.');
  });
});
