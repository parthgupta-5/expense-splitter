import { describe, expect, it } from 'vitest';
import { checkPassword, passwordProblem } from './password';

describe('password policy', () => {
  it('accepts 12+ characters with lowercase, uppercase, a number and a symbol', () => {
    expect(passwordProblem('Correct-Horse-9')).toBeNull();
    expect(passwordProblem('aB3!aB3!aB3!')).toBeNull();
  });

  it('names exactly what is missing', () => {
    expect(passwordProblem('short')).toBe(
      'Your password needs: at least 12 characters, an uppercase letter, a number, a symbol, such as ! # or ?.',
    );
    expect(passwordProblem('alllowercase1!')).toMatch(/an uppercase letter\.$/);
    expect(passwordProblem('NoNumbersHere!')).toMatch(/a number\.$/);
    expect(passwordProblem('NoSymbolsHere12')).toMatch(/a symbol/);
    expect(passwordProblem('')).toMatch(/at least 12 characters/);
  });

  it('counts only the symbols and ASCII letters Supabase Auth counts', () => {
    expect(passwordProblem('Spaces only 12')).toMatch(/a symbol/); // a space is not a symbol for Supabase
    expect(passwordProblem('ÉÉÉÉÉÉÉÉÉÉ1!a')).toMatch(/an uppercase letter/);
  });

  it('refuses passwords longer than Supabase Auth accepts', () => {
    expect(passwordProblem('aB3!' + 'x'.repeat(69))).toBe('Use at most 72 characters.');
    expect(passwordProblem('aB3!' + 'x'.repeat(68))).toBeNull();
  });

  it('reports each rule for the live checklist', () => {
    expect(checkPassword('abcDEF').map((rule) => [rule.id, rule.met])).toEqual([
      ['length', false], ['lower', true], ['upper', true], ['number', false], ['symbol', false],
    ]);
    expect(checkPassword(undefined).every((rule) => !rule.met)).toBe(true);
  });
});
