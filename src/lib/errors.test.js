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
  it('explains Supabase Auth codes without showing raw server text', () => {
    expect(friendlyError({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/wrong or has expired/);
    expect(friendlyError({ code: 'weak_password', message: 'Password is known to be weak' })).toMatch(/stronger password/);
    expect(friendlyError({ code: 'over_email_send_rate_limit', message: 'x' })).toMatch(/Wait a minute/);
    expect(friendlyError({ code: 'flow_state_not_found', message: 'x' })).toMatch(/expired or was already used/);
    expect(friendlyError({ name: 'AuthPKCECodeVerifierMissingError', message: 'x' })).toMatch(/same browser/);
    expect(friendlyError({ message: 'Unsupported provider: provider is not enabled' })).toBe('Google sign-in is not set up yet.');
  });
  it('never leaks stack traces or very long messages', () => {
    expect(friendlyError({ message: 'boom\n    at fn (file.js:1:1)' })).toBe('Something went wrong. Please try again.');
    expect(friendlyError({ message: 'x'.repeat(300) }, 'fallback')).toBe('fallback');
    expect(friendlyError(undefined)).toBe('Something went wrong. Please try again.');
  });
});
