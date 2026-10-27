// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeCode, readReturnPath, rememberReturnPath, routeAuthRedirect, safeReturnPath,
} from './authRedirect';

describe('safeReturnPath', () => {
  it('keeps paths inside the app', () => {
    expect(safeReturnPath('/groups/abc')).toBe('/groups/abc');
    expect(safeReturnPath('/settings#account')).toBe('/settings#account');
    expect(safeReturnPath('/history?x=1')).toBe('/history?x=1');
  });

  it('turns anything that could leave the site into "/"', () => {
    for (const unsafe of [
      'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)',
      'evil.example', '/\t/evil.example', '/%0a/x\n', ' /groups', '', null, undefined, 42, {}, '/' + 'a'.repeat(400),
    ]) {
      expect(safeReturnPath(unsafe), JSON.stringify(unsafe)).toBe('/');
    }
  });

  it('never returns to the callback or the reset page', () => {
    expect(safeReturnPath('/auth/callback?code=1')).toBe('/');
    expect(safeReturnPath('/reset-password')).toBe('/');
  });
});

describe('return path storage', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('remembers the latest page for this tab', () => {
    expect(readReturnPath()).toBe('/');
    rememberReturnPath('/groups/abc');
    expect(readReturnPath()).toBe('/groups/abc');
    expect(readReturnPath()).toBe('/groups/abc');
    rememberReturnPath('https://evil.example');
    expect(readReturnPath()).toBe('/');
  });

  it('checks the stored value again when reading it', () => {
    window.sessionStorage.setItem('expense-splitter-auth-return', '//evil.example');
    expect(readReturnPath()).toBe('/');
  });
});

describe('normalizeCode', () => {
  it('keeps at most six digits, so a pasted "123 456" works', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode(' 12-34-56-78 ')).toBe('123456');
    expect(normalizeCode('abc')).toBe('');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('routeAuthRedirect', () => {
  const fake = (href) => {
    const url = new URL(href, 'https://app.example');
    const calls = [];
    const location = { pathname: url.pathname, search: url.search, hash: url.hash };
    const history = { state: null, replaceState: (_state, _title, next) => calls.push(next) };
    routeAuthRedirect(location, history);
    return calls;
  };

  it('drops tokens from the address-bar fragment without using them', () => {
    expect(fake('/groups/abc#access_token=secret&refresh_token=secret2&type=recovery')).toEqual(['/groups/abc']);
    expect(fake('/?x=1#refresh_token=secret')).toEqual(['/?x=1']);
  });

  it('moves a code or error that landed on the site root to /auth/callback', () => {
    expect(fake('/?code=abc&sb_flow_id=f1&other=1')).toEqual(['/auth/callback?code=abc&sb_flow_id=f1']);
    expect(fake('/?error=access_denied&error_description=No')).toEqual(['/auth/callback?error=access_denied&error_description=No']);
    expect(fake('/#error=access_denied&error_code=otp_expired')).toEqual(['/auth/callback?error=access_denied&error_code=otp_expired']);
  });

  it('leaves ordinary addresses alone', () => {
    expect(fake('/groups/abc')).toEqual([]);
    expect(fake('/settings#account')).toEqual([]);
    expect(fake('/groups/abc?code=1')).toEqual([]); // only the root is Supabase's fallback
  });
});
