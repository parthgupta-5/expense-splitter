-- Rollback for supabase/migrations/2026110201_friends_and_account_recovery.sql. Run by hand in the SQL Editor only if
-- that migration must be undone, and deploy the previous app version first. Safe to re-run.
--
-- Friendships are dropped with their table. Accounts waiting to be deleted are restored (the column is dropped), so
-- delete them again with the previous app if that is still wanted. find_invitee() goes back to the 2026110101 version
-- only in that it no longer filters disabled accounts, which no longer exist.

begin;

drop trigger if exists group_invitations_active_accounts on public.group_invitations;
drop function if exists public.guard_invitation_accounts();
drop function if exists public.accounts_due_for_deletion(integer);
drop function if exists public.restore_account();
drop function if exists public.schedule_account_deletion(uuid);
drop function if exists public.list_friends();
drop function if exists public.remove_friend(uuid);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.send_friend_request(text);
drop trigger if exists friendships_signal on public.friendships;
drop function if exists public.signal_friendship_change();
drop table if exists public.friendships;

-- find_invitee() still reads deletion_requested_at, so it is replaced before the column goes: the 2026110101 body
-- with the filter removed.
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
  from public.profiles pr where pr.username = handle and pr.username_confirmed_at is not null;
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

drop function if exists public.is_account_active(uuid);
drop function if exists public.account_restore_window();
alter table public.profiles drop column if exists deletion_requested_at;

commit;
