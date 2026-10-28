// The data layer's two pieces with logic of their own: reading the delete-account Edge Function's answers, and the one
// realtime channel's subscriptions. The Supabase client is a small fake.
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const fake = vi.hoisted(() => ({ invoke: vi.fn(), bindings: [], removed: [] }));
vi.mock('../supabase', () => {
  const channel = {
    on: (type, filter, callback) => { fake.bindings.push({ type, filter, callback }); return channel; },
    subscribe: (callback) => { callback('SUBSCRIBED'); return channel; },
  };
  return {
    supabaseUrl: 'https://abc.supabase.co',
    supabase: {
      functions: { invoke: fake.invoke },
      channel: () => channel,
      removeChannel: (item) => fake.removed.push(item),
    },
  };
});

const { AccountDeletionError, deleteAccount, subscribeToChanges } = await import('./cloudRepo');

beforeEach(() => { fake.invoke.mockReset(); fake.bindings = []; fake.removed = []; });

describe('deleteAccount', () => {
  it('resolves only when the function says the account was deleted', async () => {
    fake.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    await expect(deleteAccount('asha_rao')).resolves.toEqual({ deleted: true });
    expect(fake.invoke).toHaveBeenCalledWith('delete-account', { body: { confirm: 'asha_rao' } });
  });

  it('turns the function\'s refusal into an error with its code, message and blocking groups', async () => {
    fake.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ code: 'owns_shared_groups', message: 'Delete those groups first.', groups: ['Flat'] }) } },
    });
    const error = await deleteAccount('asha_rao').catch((failure) => failure);
    expect(error).toBeInstanceOf(AccountDeletionError);
    expect(error).toMatchObject({ code: 'owns_shared_groups', message: 'Delete those groups first.', groups: ['Flat'] });
  });

  it('never treats an unexpected answer as success, and explains a network failure', async () => {
    fake.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(deleteAccount('x')).rejects.toMatchObject({ code: 'unknown', message: expect.stringMatching(/could not be deleted/) });
    fake.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
    await expect(deleteAccount('x')).rejects.toMatchObject({ code: 'network', message: expect.stringMatching(/Nothing was deleted/) });
  });
});

describe('subscribeToChanges', () => {
  it('adds the invitation signal for this user only to the same channel, never delete events', () => {
    const onInvitationsChanged = vi.fn();
    const stop = subscribeToChanges({
      userId: 'u-1', onGroupChanged: vi.fn(), onGroupDeleted: vi.fn(), onInvitationsChanged, onStatus: vi.fn(),
    });
    const invitations = fake.bindings.filter((binding) => binding.filter.table === 'invitation_updates');
    expect(invitations.map((binding) => [binding.filter.event, binding.filter.filter])).toEqual([
      ['INSERT', 'user_id=eq.u-1'], ['UPDATE', 'user_id=eq.u-1'],
    ]);
    invitations[1].callback({ new: { user_id: 'u-1' } });
    expect(onInvitationsChanged).toHaveBeenCalledTimes(1);
    expect(fake.bindings.map((binding) => binding.filter.table)).toEqual(['activity_log', 'groups', 'invitation_updates', 'invitation_updates']);
    stop();
    expect(fake.removed).toHaveLength(1);
  });

  it('subscribes as before when there is no invitation listener', () => {
    subscribeToChanges({ onGroupChanged: vi.fn(), onGroupDeleted: vi.fn() });
    expect(fake.bindings.map((binding) => binding.filter.table)).toEqual(['activity_log', 'groups']);
  });
});
