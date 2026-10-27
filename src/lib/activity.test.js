import { describe, expect, it } from 'vitest';
import { describeActivity } from './activity';
import { centsToDecimal } from './money';
import { normalizeSupabaseUrl } from '../supabase';

const money = (cents) => '₹' + centsToDecimal(cents);

describe('describeActivity', () => {
  it('writes readable sentences with the actor and amount', () => {
    expect(describeActivity({
      action: 'expense_added', actor_name: 'Asha', details: { description: 'Dinner', amount_cents: 120050, payer: 'Ben' },
    }, money)).toEqual({ kind: 'expense', text: 'Asha added “Dinner” · ₹1200.50, paid by Ben' });
    expect(describeActivity({
      action: 'payment_added', actor_name: '', details: { payer: 'Ben', payee: 'Asha', amount_cents: 500 },
    }, money).text).toBe('Someone recorded Ben paying Asha ₹5.00');
    expect(describeActivity({ action: 'member_joined', actor_name: 'Asha', details: { name: 'Ben' } }, money).text)
      .toBe('Ben joined (invited by Asha)');
  });

  it('never crashes on an unknown action', () => {
    expect(describeActivity({ action: 'something_new', actor_name: 'Asha' }, money).text).toBe('Asha: something_new');
  });
});

describe('normalizeSupabaseUrl', () => {
  it('trims the REST path that breaks sign-in', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
    expect(normalizeSupabaseUrl(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co');
  });
  it('returns an empty string for missing or invalid values', () => {
    expect(normalizeSupabaseUrl(undefined)).toBe('');
    expect(normalizeSupabaseUrl('not a url')).toBe('');
  });
});
