import { describe, expect, it } from 'vitest';
import {
  describePeople, describeRejected, inviteeOutcome, parseNames, personLabel, removalStatus,
} from './people';

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

describe('personLabel (mirrors public.person_label)', () => {
  it('uses the tidied display name, at most 40 characters, else the username', () => {
    expect(personLabel({ display_name: '  Asha   Rao ', username: 'asha_rao' })).toBe('Asha Rao');
    expect(personLabel({ display_name: 'A'.repeat(39) + ' Z', username: 'x_y' })).toBe('A'.repeat(39));
    expect(personLabel({ display_name: '   ', username: 'quiet_one' })).toBe('quiet_one');
    expect(personLabel(null)).toBe('Organizer');
  });
});

describe('describePeople', () => {
  const records = [
    { id: 'p-me', name: 'Me', userId: 'u-me' },
    { id: 'p-ben', name: 'Ben', userId: 'u-ben' },
    { id: 'p-cat', name: 'Cat', userId: null },
    { id: 'p-dev', name: 'Dev', userId: null },
  ];
  const statuses = [
    { person_id: 'p-me', name: 'Me', user_id: 'u-me', member_role: 'owner', username: 'me_one' },
    { person_id: 'p-ben', name: 'Ben', user_id: 'u-ben', member_role: 'member', username: 'ben_k', avatar_url: 'x' },
    {
      person_id: 'p-cat', name: 'Cat', user_id: null, invitation_id: 'i-1', invitation_status: 'declined', invitee_username: 'cat',
    },
    { person_id: 'p-dev', name: 'Dev', user_id: null, invitation_status: null },
  ];

  it('says what each person is, in the group\'s order', () => {
    const people = describePeople({
      people: ['Me', 'Ben', 'Cat', 'Dev', 'New'], records, statuses, userId: 'u-me', cloud: true,
    });
    expect(people.map((person) => [person.name, person.kind])).toEqual([
      ['Me', 'you'], ['Ben', 'member'], ['Cat', 'declined'], ['Dev', 'guest'], ['New', 'guest'],
    ]);
    expect(people[1]).toMatchObject({ role: 'member', username: 'ben_k', avatarUrl: 'x' });
    expect(people[2].invitation).toMatchObject({ id: 'i-1', status: 'declined', username: 'cat' });
  });

  it('falls back to the group\'s own records before statuses load, and treats guest-mode groups as plain names', () => {
    expect(describePeople({ people: ['Me', 'Cat'], records, userId: 'u-me', cloud: true }).map((p) => p.kind)).toEqual(['you', 'guest']);
    expect(describePeople({ people: ['Me'], records, userId: 'u-me' })[0].kind).toBe('local');
  });
});

describe('inviteeOutcome', () => {
  it('allows adding only an available account (or one invited before, when linking a guest)', () => {
    expect(inviteeOutcome({ status: 'available', username: 'p', person_name: 'Priya' })).toMatchObject({
      canAdd: true, text: expect.stringMatching(/^They will appear as Priya\./),
    });
    expect(inviteeOutcome({ status: 'invited_before', username: 'p', person_name: 'P', last_status: 'expired' }).canAdd).toBe(false);
    expect(inviteeOutcome({ status: 'invited_before', username: 'p' }, { linking: true }).canAdd).toBe(true);
    for (const status of ['self', 'member', 'pending', 'cooldown', 'not_found', 'invalid', 'weird']) {
      expect(inviteeOutcome({ status, username: 'p', person_name: 'P' }).canAdd, status).toBe(false);
    }
    expect(inviteeOutcome({ status: 'self' }).text).toBe('That is you. Use “Add yourself” in the people list.');
    expect(inviteeOutcome({ status: 'invalid' }, { rules: 'Rules' }).text).toBe('Rules');
  });
});
