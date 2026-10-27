import { describe, expect, it } from 'vitest';
import {
  USERNAME_RULES, needsUsername, nextUsernameChange, normalizeUsername, usernameProblem,
} from './username';

describe('normalizeUsername', () => {
  it('trims, removes one leading @ and lowercases', () => {
    expect(normalizeUsername('  @Asha_Rao ')).toBe('asha_rao');
    expect(normalizeUsername('@@asha')).toBe('@asha');
    expect(normalizeUsername(undefined)).toBe('');
  });
});

describe('usernameProblem', () => {
  it('accepts 3-20 lowercase letters, digits and _, starting with a letter', () => {
    ['abc', 'asha_rao', 'priya123', 'a'.repeat(20), 'a_1'].forEach((name) => expect(usernameProblem(name), name).toBeNull());
  });
  it.each(['', 'ab', 'a'.repeat(21), '1asha', '_asha', 'asha rao', 'asha-rao', 'asha.rao', 'Asha'])(
    'rejects %j with the rules',
    (name) => expect(usernameProblem(name)).toBe(USERNAME_RULES),
  );
  it('rejects Unicode look-alikes (Cyrillic а, accented and full-width letters)', () => {
    ['аsha', 'émile', 'ａsha', normalizeUsername('İnci')].forEach((name) => expect(usernameProblem(name), name).toBe(USERNAME_RULES));
  });
  it('rejects reserved names and the provisional user_ prefix', () => {
    ['admin', 'support', 'settings', 'user_ab12cd34', 'user_me'].forEach((name) => {
      expect(usernameProblem(name), name).toBe('That username is reserved');
    });
    expect(usernameProblem('username1')).toBeNull();
  });
});

describe('needsUsername', () => {
  it('asks only accounts whose username is still provisional', () => {
    expect(needsUsername({ username: 'user_ab12cd34', username_confirmed_at: null })).toBe(true);
    expect(needsUsername({ username: 'asha', username_confirmed_at: '2026-10-01T00:00:00Z' })).toBe(false);
    // Before the migration runs there is no username column: never block the app.
    expect(needsUsername({ display_name: 'Asha' })).toBe(false);
    expect(needsUsername(null)).toBe(false);
  });
});

describe('nextUsernameChange', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  it('is null when the name may be changed now', () => {
    expect(nextUsernameChange({ username_confirmed_at: '2026-10-01T00:00:00Z', username_changed_at: null }, now)).toBeNull();
    expect(nextUsernameChange({ username_confirmed_at: 'x', username_changed_at: '2026-09-01T00:00:00Z' }, now)).toBeNull();
  });
  it('is 30 days after the last change otherwise', () => {
    const next = nextUsernameChange({ username_confirmed_at: 'x', username_changed_at: '2026-10-20T00:00:00Z' }, now);
    expect(next.toISOString().slice(0, 10)).toBe('2026-11-19');
  });
});
