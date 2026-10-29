-- Friends (with requests) and a 7-day window to restore a deleted account. Run AFTER
-- 2026110101_people_invites_account_deletion.sql. Safe to re-run.
-- Rollback: supabase/rollbacks/2026110201_friends_and_account_recovery.down.sql.
--
-- 1. Friends. One friendships row per pair of accounts: pending (a request), accepted, or declined. A request is sent
--    to an exact @username and becomes a friendship only when the other account accepts it. After a decline the same
--    person can ask again after 7 days. Everything goes through the functions below; the table itself is not readable
--    or writable by app users. Changes bump invitation_updates, so the app's existing live channel picks them up.
-- 2. Deleting an account now happens in two steps. The delete-account Edge Function calls schedule_account_deletion():
--    the account is disabled at once (it cannot be found, invited or sent friend requests, and its pending invitations
--    and requests are withdrawn) and stays restorable for 7 days with restore_account(). After that the
--    purge-deleted-accounts Edge Function deletes the auth user, which runs prepare_account_deletion() as before.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Disabled accounts
-- ---------------------------------------------------------------------------------------------------------------

alter table public.profiles add column if not exists deletion_requested_at timestamptz;

-- How long a deleted account can still be restored.
create or replace function public.account_restore_window()
returns interval language sql immutable as $$ select interval '7 days' $$;

-- True for an account that exists and is not scheduled for deletion.
create or replace function public.is_account_active(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = target_user and deletion_requested_at is null);
$$;

-- A disabled account can neither send nor receive group invitations (this covers add_person_by_username() and
-- invite_by_username()). The message is the same as for an unknown username, so nothing is revealed.
create or replace function public.guard_invitation_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invited_by is not null and not public.is_account_active(new.invited_by) then
    raise exception 'Your account is scheduled for deletion. Restore it first.' using errcode = '42501';
  end if;
  if not public.is_account_active(new.invitee_id) then
    raise exception 'No account has that username' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists group_invitations_active_accounts on public.group_invitations;
create trigger group_invitations_active_accounts before insert on public.group_invitations
for each row execute function public.guard_invitation_accounts();

-- find_invitee() as in 2026110101_people_invites_account_deletion.sql, except that a disabled account is not found.
create or replace function public.find_invitee(target_group_id uuid, invitee_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  handle text := public.normalize_username(invitee_username);
  invitee record;
  found_as jsonb;
  linked text;
  waiting text;
  declined_at timestamptz;
  previous record;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_group_owner(target_group_id) then
    raise exception 'Only the group owner can add people by username' using errcode = '42501';
  end if;
  perform public.throttle('find_invitee', 30, interval '10 minutes');
  if public.username_problem(handle) = 'invalid' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select pr.id, pr.username, pr.display_name, pr.avatar_url into invitee
  from public.profiles pr where pr.username = handle and pr.username_confirmed_at is not null
    and pr.deletion_requested_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  found_as := jsonb_build_object(
    'username', invitee.username, 'display_name', coalesce(invitee.display_name, ''),
    'avatar_url', public.safe_avatar_url(invitee.id, invitee.avatar_url)
  );
  select name into linked from public.group_people where group_id = target_group_id and user_id = invitee.id;
  if invitee.id = me then
    return found_as || jsonb_build_object('status', 'self', 'person_name', linked);
  end if;
  if linked is not null then
    return found_as || jsonb_build_object('status', 'member', 'person_name', linked);
  end if;
  perform public.expire_invitations(target_group_id, null, null);
  select p.name into waiting from public.group_invitations i join public.group_people p on p.id = i.person_id
  where i.group_id = target_group_id and i.invitee_id = invitee.id and i.status = 'pending';
  if waiting is not null then
    return found_as || jsonb_build_object('status', 'pending', 'person_name', waiting);
  end if;
  select max(responded_at) into declined_at from public.group_invitations
  where group_id = target_group_id and invitee_id = invitee.id and status = 'declined';
  if declined_at > now() - interval '7 days' then
    return found_as || jsonb_build_object('status', 'cooldown',
      'retry_on', to_char(declined_at + interval '7 days', 'FMDD Mon YYYY'));
  end if;
  select p.name, i.status into previous
  from public.group_invitations i join public.group_people p on p.id = i.person_id
  where i.group_id = target_group_id and i.invitee_id = invitee.id and p.user_id is null and i.cleared_at is null
  order by i.created_at desc limit 1;
  if found then
    return found_as || jsonb_build_object('status', 'invited_before', 'person_name', previous.name,
      'last_status', previous.status);
  end if;
  return found_as || jsonb_build_object('status', 'available',
    'person_name', public.free_person_name(target_group_id, invitee.id));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Friends
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee on public.friendships (addressee_id);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- Both accounts hear about every change (on the channel they already use for invitations). Not an account that is
-- itself being deleted: its row in auth.users is already gone when the cascade removes its friendships.
create or replace function public.signal_friendship_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_now public.friendships;
begin
  if tg_op = 'DELETE' then row_now := old; else row_now := new; end if;
  if exists (select 1 from auth.users where id = row_now.requester_id) then
    perform public.bump_invitation_update(row_now.requester_id);
  end if;
  if exists (select 1 from auth.users where id = row_now.addressee_id) then
    perform public.bump_invitation_update(row_now.addressee_id);
  end if;
  return null;
end;
$$;

drop trigger if exists friendships_signal on public.friendships;
create trigger friendships_signal after insert or update or delete on public.friendships
for each row execute function public.signal_friendship_change();

-- Sends a friend request to the account with this exact @username. If they already asked the caller, this accepts
-- theirs instead. Returns { status: 'pending' | 'accepted', username, display_name } or { error }.
create or replace function public.send_friend_request(friend_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  handle text := public.normalize_username(friend_username);
  friend record;
  existing public.friendships;
  found_as jsonb;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_account_active(me) then
    return jsonb_build_object('error', 'Your account is scheduled for deletion. Restore it first.');
  end if;
  perform public.throttle('friend_request', 30, interval '1 hour');

  select pr.id, pr.username, pr.display_name into friend
  from public.profiles pr
  where public.username_problem(handle) is distinct from 'invalid'
    and pr.username = handle and pr.username_confirmed_at is not null and pr.deletion_requested_at is null;
  if not found then
    return jsonb_build_object('error', 'No account has that username');
  end if;
  if friend.id = me then
    return jsonb_build_object('error', 'That is you');
  end if;
  found_as := jsonb_build_object('username', friend.username, 'display_name', coalesce(friend.display_name, ''));

  select * into existing from public.friendships
  where least(requester_id, addressee_id) = least(me, friend.id)
    and greatest(requester_id, addressee_id) = greatest(me, friend.id)
  for update;

  if found then
    if existing.status = 'accepted' then
      return jsonb_build_object('error', 'You are already friends with @' || friend.username);
    end if;
    if existing.status = 'pending' and existing.requester_id = me then
      return jsonb_build_object('error', 'You already sent @' || friend.username || ' a friend request');
    end if;
    if existing.status = 'pending' then -- they asked first: this is a yes
      update public.friendships set status = 'accepted', responded_at = now() where id = existing.id;
      return found_as || jsonb_build_object('status', 'accepted', 'friendship_id', existing.id);
    end if;
    if existing.requester_id = me and existing.responded_at > now() - interval '7 days' then
      return jsonb_build_object('error', '@' || friend.username || ' declined recently. You can ask again on '
        || to_char(existing.responded_at + interval '7 days', 'FMDD Mon YYYY'));
    end if;
  end if;

  if (select count(*) from public.friendships where requester_id = me and status = 'pending') >= 50 then
    return jsonb_build_object('error', 'You have 50 friend requests waiting for an answer. Cancel some first.');
  end if;

  if found then
    update public.friendships
    set requester_id = me, addressee_id = friend.id, status = 'pending', created_at = now(), responded_at = null
    where id = existing.id;
    return found_as || jsonb_build_object('status', 'pending', 'friendship_id', existing.id);
  end if;
  begin
    insert into public.friendships (requester_id, addressee_id) values (me, friend.id) returning * into existing;
  exception
    when unique_violation then
      return jsonb_build_object('error', 'Something changed at the same moment. Please try again.');
  end;
  return found_as || jsonb_build_object('status', 'pending', 'friendship_id', existing.id);
end;
$$;

-- The addressee answers a pending request. Returns { status: 'accepted' | 'declined' } or { error }.
create or replace function public.respond_friend_request(request_id uuid, accepting boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  request public.friendships;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_account_active(me) then
    return jsonb_build_object('error', 'Your account is scheduled for deletion. Restore it first.');
  end if;
  select * into request from public.friendships
  where id = request_id and addressee_id = me and status = 'pending' for update;
  if not found or not public.is_account_active(request.requester_id) then
    return jsonb_build_object('error', 'This friend request is no longer waiting for you');
  end if;
  update public.friendships
  set status = case when accepting then 'accepted' else 'declined' end, responded_at = now()
  where id = request.id;
  return jsonb_build_object('status', case when accepting then 'accepted' else 'declined' end);
end;
$$;

-- Removes a friend, or cancels a request the caller sent. Returns { removed: true } or { error }.
create or replace function public.remove_friend(friend_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(me, friend_id)
    and greatest(requester_id, addressee_id) = greatest(me, friend_id)
    and (status = 'accepted' or (status = 'pending' and requester_id = me));
  if not found then
    return jsonb_build_object('error', 'Nothing to remove');
  end if;
  return jsonb_build_object('removed', true);
end;
$$;

-- The caller's friends and pending requests (both directions), with each account's public details. Never emails.
-- Accounts scheduled for deletion are left out.
create or replace function public.list_friends()
returns table (
  friendship_id uuid, user_id uuid, username text, display_name text, avatar_url text,
  status text, direction text, created_at timestamptz, responded_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
    select f.id, pr.id, pr.username, coalesce(pr.display_name, ''), public.safe_avatar_url(pr.id, pr.avatar_url),
      f.status, case when f.addressee_id = me then 'incoming' else 'outgoing' end, f.created_at, f.responded_at
    from public.friendships f
    join public.profiles pr on pr.id = case when f.requester_id = me then f.addressee_id else f.requester_id end
    where (f.requester_id = me or f.addressee_id = me)
      and f.status in ('pending', 'accepted')
      and pr.deletion_requested_at is null
    order by f.status desc, lower(coalesce(nullif(pr.display_name, ''), pr.username));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Scheduling, restoring and finishing a deletion
-- ---------------------------------------------------------------------------------------------------------------

-- Server only (the delete-account Edge Function, after it has checked a recent sign-in and the typed username).
-- Disables the account at once and withdraws what is waiting on it. Returns { deletes_on } or { error }.
create or replace function public.schedule_account_deletion(target_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  shared text;
  requested timestamptz;
begin
  perform 1 from public.groups where created_by = target_user for update;
  select string_agg(g.name, ', ' order by g.name) into shared
  from public.groups g
  where g.created_by = target_user
    and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> target_user);
  if shared is not null then
    return jsonb_build_object('error', 'owns_shared_groups', 'groups', shared);
  end if;

  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now())
  where id = target_user returning deletion_requested_at into requested;
  if requested is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- Invitations to this account, and invitations it sent from its own groups, are withdrawn, so nobody can join one of
  -- its groups (which would block the final deletion) while it waits.
  update public.group_invitations set status = 'revoked', responded_at = now()
  where status = 'pending'
    and (invitee_id = target_user or group_id in (select id from public.groups where created_by = target_user));
  delete from public.friendships
  where status = 'pending' and (requester_id = target_user or addressee_id = target_user);
  return jsonb_build_object(
    'deletion_requested_at', requested, 'deletes_on', requested + public.account_restore_window()
  );
end;
$$;

-- The signed-in owner of a disabled account takes it back within the window. Returns { restored } or { error }.
-- Invitations and friend requests withdrawn by the deletion stay withdrawn; friendships themselves were kept.
create or replace function public.restore_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  requested timestamptz;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select deletion_requested_at into requested from public.profiles where id = me for update;
  if requested is null then
    return jsonb_build_object('restored', true);
  end if;
  if requested + public.account_restore_window() <= now() then
    return jsonb_build_object('error', 'The 7 days to restore this account have passed. It is being deleted.');
  end if;
  update public.profiles set deletion_requested_at = null where id = me;
  return jsonb_build_object('restored', true);
end;
$$;

-- Server only (the purge-deleted-accounts Edge Function): accounts whose restore window has ended, oldest first.
create or replace function public.accounts_due_for_deletion(max_rows integer default 100)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select id from public.profiles
  where deletion_requested_at is not null and deletion_requested_at + public.account_restore_window() <= now()
  order by deletion_requested_at
  limit greatest(1, least(coalesce(max_rows, 100), 500));
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------------------------------------------

revoke execute on function public.is_account_active(uuid) from public, anon, authenticated;
revoke execute on function public.guard_invitation_accounts() from public, anon, authenticated;
revoke execute on function public.signal_friendship_change() from public, anon, authenticated;
revoke execute on function public.schedule_account_deletion(uuid) from public, anon, authenticated;
revoke execute on function public.accounts_due_for_deletion(integer) from public, anon, authenticated;
revoke execute on function public.find_invitee(uuid, text) from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.list_friends() from public, anon;
revoke execute on function public.restore_account() from public, anon;
grant execute on function public.find_invitee(uuid, text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.restore_account() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.schedule_account_deletion(uuid) to service_role;
    grant execute on function public.accounts_due_for_deletion(integer) to service_role;
  end if;
end;
$$;

commit;
