-- Group invitations by username, replacing email invitations. Run AFTER 2026103001_avatar_storage.sql. Safe to re-run.
-- Rollback: supabase/rollbacks/2026103101_username_invitations.down.sql.
--
-- The owner invites an existing account by its @username to become one specific person in the group (a row of
-- group_people). The invitee accepts or declines. Accepting links that account to that person and makes it a member,
-- in one transaction. Usernames are only used to find the account: every check and link uses auth.users.id.
-- Invitations expire after 30 days; after a decline the same person cannot be offered to the same account for 7 days;
-- a group can have at most 20 pending invitations. Email addresses are never looked up or returned any more.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. People get a stable id and an optional linked account
-- ---------------------------------------------------------------------------------------------------------------

-- Expenses and payments keep naming people by name; the id only lets an invitation point at one exact person row
-- (a removed person re-added under the same name is a different row, so an old invitation can never claim it).
alter table public.group_people add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists group_people_id_key on public.group_people (id);
alter table public.group_people add column if not exists user_id uuid references auth.users (id) on delete set null;
-- An account is at most one person in a group.
create unique index if not exists group_people_user_key on public.group_people (group_id, user_id)
  where user_id is not null;

-- Clients add people by name only and never change a person; user_id is set only by accept_invitation().
revoke insert, update on public.group_people from authenticated, anon;
grant insert (group_id, name) on public.group_people to authenticated;

-- A person linked to an account stays until that member leaves or is removed (which unlinks them first).
create or replace function public.guard_linked_person_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.user_id is not null and exists (select 1 from public.groups where id = old.group_id) then
    raise exception '% is linked to a member''s account. Remove that member from the group first.', old.name
      using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists group_people_guard_linked on public.group_people;
create trigger group_people_guard_linked before delete on public.group_people
for each row execute function public.guard_linked_person_removal();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Invitations (no client access to the table: only the functions below read or change it)
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  person_id uuid not null references public.group_people (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  responded_at timestamptz
);
-- One pending invitation per person, and per account in a group.
create unique index if not exists group_invitations_pending_person_key on public.group_invitations (person_id)
  where status = 'pending';
create unique index if not exists group_invitations_pending_invitee_key on public.group_invitations (group_id, invitee_id)
  where status = 'pending';
create index if not exists group_invitations_invitee_idx on public.group_invitations (invitee_id, created_at desc);
create index if not exists group_invitations_group_idx on public.group_invitations (group_id, status);

alter table public.group_invitations enable row level security;
revoke all on public.group_invitations from anon, authenticated;

-- Marks pending invitations past their 30 days as expired (for one group, one invitee, or one invitation).
create or replace function public.expire_invitations(target_group_id uuid, target_invitee uuid, target_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.group_invitations set status = 'expired', responded_at = expires_at
  where status = 'pending' and expires_at <= now()
    and (target_group_id is null or group_id = target_group_id)
    and (target_invitee is null or invitee_id = target_invitee)
    and (target_id is null or id = target_id);
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Sending, answering and revoking invitations
-- ---------------------------------------------------------------------------------------------------------------

-- Owner only. Returns the new invitation, or { "error": message } when a rule is not met. Rule failures are returned
-- (not raised) so they still count towards the rate limit, and so this cannot be used to probe usernames freely.
create or replace function public.invite_by_username(target_group_id uuid, target_person_id uuid, invitee_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  handle text := public.normalize_username(invitee_username);
  person record;
  invitee record;
  declined_at timestamptz;
  created record;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_group_owner(target_group_id) then
    raise exception 'Only the group owner can invite people' using errcode = '42501';
  end if;
  perform public.throttle('group_invite', 30, interval '1 hour');
  -- One invitation change at a time per group, so the limits and duplicate checks below cannot race.
  perform 1 from public.groups where id = target_group_id for update;

  select p.id, p.name, p.user_id into person
  from public.group_people p where p.id = target_person_id and p.group_id = target_group_id
  for update;
  if not found then
    return jsonb_build_object('error', 'Choose a person from this group');
  end if;
  if person.user_id is not null then
    return jsonb_build_object('error', person.name || ' is already linked to an account');
  end if;

  select pr.id, pr.username, pr.display_name into invitee
  from public.profiles pr
  where public.username_problem(handle) is distinct from 'invalid'
    and pr.username = handle and pr.username_confirmed_at is not null;
  if not found then
    return jsonb_build_object('error', 'No account has that username');
  end if;
  if invitee.id = me then
    return jsonb_build_object('error', 'You cannot invite yourself');
  end if;
  if exists (select 1 from public.group_people where group_id = target_group_id and user_id = invitee.id) then
    return jsonb_build_object('error', '@' || invitee.username || ' is already linked to someone in this group');
  end if;

  perform public.expire_invitations(target_group_id, null, null);
  if exists (
    select 1 from public.group_invitations
    where group_id = target_group_id and invitee_id = invitee.id and status = 'pending'
  ) then
    return jsonb_build_object('error', '@' || invitee.username || ' already has a pending invitation to this group');
  end if;
  if exists (select 1 from public.group_invitations where person_id = person.id and status = 'pending') then
    return jsonb_build_object('error', person.name || ' already has a pending invitation');
  end if;
  select max(responded_at) into declined_at from public.group_invitations
  where group_id = target_group_id and person_id = person.id and invitee_id = invitee.id and status = 'declined';
  if declined_at > now() - interval '7 days' then
    return jsonb_build_object('error', '@' || invitee.username || ' declined recently. You can invite them again on '
      || to_char(declined_at + interval '7 days', 'FMDD Mon YYYY'));
  end if;
  if (select count(*) from public.group_invitations where group_id = target_group_id and status = 'pending') >= 20 then
    return jsonb_build_object('error',
      'This group already has 20 pending invitations. Revoke some, or wait for answers.');
  end if;

  begin
    insert into public.group_invitations (group_id, person_id, invitee_id, invited_by)
    values (target_group_id, person.id, invitee.id, me)
    returning id, expires_at into created;
  exception
    when unique_violation then
      return jsonb_build_object('error', 'An invitation for ' || person.name || ' is already pending');
  end;
  return jsonb_build_object(
    'id', created.id, 'status', 'pending', 'person_name', person.name, 'username', invitee.username,
    'display_name', invitee.display_name, 'expires_at', created.expires_at
  );
end;
$$;

-- Invitee only. Links the account to the invited person and makes it a member, in one transaction. Safe to retry:
-- accepting an already-accepted invitation changes nothing. Returns { group_id, person_name } or { error }.
create or replace function public.accept_invitation(invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.group_invitations;
  person record;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into inv from public.group_invitations where id = invitation_id for update;
  if not found or inv.invitee_id <> me then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  select p.id, p.name, p.user_id into person
  from public.group_people p where p.id = inv.person_id and p.group_id = inv.group_id
  for update;

  if inv.status = 'accepted' then
    return jsonb_build_object('group_id', inv.group_id, 'person_name', person.name, 'status', 'accepted');
  end if;
  if inv.status = 'pending' and inv.expires_at <= now() then
    perform public.expire_invitations(null, null, inv.id);
    return jsonb_build_object('error', 'This invitation has expired. Ask the owner to invite you again.');
  end if;
  if inv.status <> 'pending' then
    return jsonb_build_object('error', 'This invitation was ' || inv.status);
  end if;
  if person.user_id is not null and person.user_id <> me then
    return jsonb_build_object('error', person.name || ' is already linked to another account');
  end if;
  if exists (
    select 1 from public.group_people where group_id = inv.group_id and user_id = me and id <> person.id
  ) then
    return jsonb_build_object('error', 'You are already linked to another person in this group');
  end if;

  update public.group_people set user_id = me where id = person.id;
  insert into public.group_members (group_id, user_id, role) values (inv.group_id, me, 'member')
  on conflict (group_id, user_id) do nothing;
  update public.group_invitations set status = 'accepted', responded_at = now() where id = inv.id;
  return jsonb_build_object('group_id', inv.group_id, 'person_name', person.name, 'status', 'accepted');
end;
$$;

-- Invitee only. Nothing is linked. Safe to retry. Returns { status } or { error }.
create or replace function public.decline_invitation(invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.group_invitations;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into inv from public.group_invitations where id = invitation_id for update;
  if not found or inv.invitee_id <> me then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.status = 'declined' then
    return jsonb_build_object('status', 'declined');
  end if;
  if inv.status = 'pending' and inv.expires_at <= now() then
    perform public.expire_invitations(null, null, inv.id);
    return jsonb_build_object('error', 'This invitation has already expired');
  end if;
  if inv.status <> 'pending' then
    return jsonb_build_object('error', 'This invitation was ' || inv.status);
  end if;
  update public.group_invitations set status = 'declined', responded_at = now() where id = inv.id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- The group's owner only. Returns { status } or { error }.
create or replace function public.revoke_invitation(invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.group_invitations;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into inv from public.group_invitations where id = invitation_id for update;
  if not found or not public.is_group_owner(inv.group_id) then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.status = 'revoked' then
    return jsonb_build_object('status', 'revoked');
  end if;
  if inv.status = 'pending' and inv.expires_at <= now() then
    perform public.expire_invitations(null, null, inv.id);
    return jsonb_build_object('status', 'expired');
  end if;
  if inv.status <> 'pending' then
    return jsonb_build_object('error', 'This invitation was already ' || inv.status);
  end if;
  update public.group_invitations set status = 'revoked', responded_at = now() where id = inv.id;
  return jsonb_build_object('status', 'revoked');
end;
$$;

-- The caller's own invitations (the last 30 days, newest first). Shows the group's name and the sender's name and
-- @username so the invitee knows what they are joining; never an email address.
create or replace function public.list_my_invitations()
returns table (
  id uuid, group_id uuid, group_name text, person_name text, invited_by_name text, invited_by_username text,
  status text, created_at timestamptz, expires_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.expire_invitations(null, auth.uid(), null);
  return query
    select i.id, i.group_id, g.name, p.name, coalesce(s.display_name, ''), s.username, i.status, i.created_at, i.expires_at
    from public.group_invitations i
    join public.groups g on g.id = i.group_id
    join public.group_people p on p.id = i.person_id
    left join public.profiles s on s.id = i.invited_by
    where i.invitee_id = auth.uid() and i.created_at > now() - interval '30 days'
    order by (i.status = 'pending') desc, i.created_at desc
    limit 50;
end;
$$;

-- The group's invitations, for its owner only (the last 30 days, pending first). Usernames and names, no emails.
create or replace function public.list_group_invitations(target_group_id uuid)
returns table (
  id uuid, person_id uuid, person_name text, invitee_username text, invitee_name text, status text,
  created_at timestamptz, expires_at timestamptz, responded_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(target_group_id) then
    raise exception 'Only the group owner can see its invitations' using errcode = '42501';
  end if;
  perform public.expire_invitations(target_group_id, null, null);
  return query
    select i.id, i.person_id, p.name, u.username, coalesce(u.display_name, ''), i.status, i.created_at, i.expires_at,
      i.responded_at
    from public.group_invitations i
    join public.group_people p on p.id = i.person_id
    join public.profiles u on u.id = i.invitee_id
    where i.group_id = target_group_id and (i.status = 'pending' or i.created_at > now() - interval '30 days')
    order by (i.status = 'pending') desc, i.created_at desc
    limit 100;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Members: no email addresses; email invitations are switched off
-- ---------------------------------------------------------------------------------------------------------------

-- Same columns as before (so every migration can still be re-run in order and older apps keep working), but the email
-- column is now always empty: members never see each other's addresses.
create or replace function public.list_members(target_group_id uuid)
returns table (user_id uuid, role text, display_name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  return query
    select gm.user_id, gm.role, coalesce(pr.display_name, ''), null::text, gm.joined_at
    from public.group_members gm
    left join public.profiles pr on pr.id = gm.user_id
    where gm.group_id = target_group_id
    order by gm.role desc, gm.joined_at;
end;
$$;

-- Members of a group with their @username and the person they are in the group; for members only. No emails.
create or replace function public.list_group_members(target_group_id uuid)
returns table (user_id uuid, role text, display_name text, username text, person_name text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  return query
    select gm.user_id, gm.role, coalesce(pr.display_name, ''), pr.username, gp.name, gm.joined_at
    from public.group_members gm
    left join public.profiles pr on pr.id = gm.user_id
    left join public.group_people gp on gp.group_id = gm.group_id and gp.user_id = gm.user_id
    where gm.group_id = target_group_id
    order by gm.role desc, gm.joined_at;
end;
$$;

-- Kept (with the same signature) so an older app gets a clear answer instead of a missing function.
create or replace function public.invite_member(target_group_id uuid, member_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Invitations by email have been replaced. Update the app and invite people by their @username.'
    using errcode = '0A000';
end;
$$;

-- As before (the owner removes anyone else; members can leave; the owner cannot), and now also unlinks the member's
-- person (who stays in the group with their expenses) and cancels their pending invitations.
create or replace function public.remove_member(target_group_id uuid, member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.group_members where group_id = target_group_id and user_id = member_id and role = 'owner'
  ) then
    raise exception 'The owner cannot leave the group. Delete the group instead.' using errcode = '42501';
  end if;
  if member_id <> auth.uid() and not public.is_group_owner(target_group_id) then
    raise exception 'Only the group owner can remove members' using errcode = '42501';
  end if;
  update public.group_people set user_id = null where group_id = target_group_id and user_id = member_id;
  update public.group_invitations set status = 'revoked', responded_at = now()
  where group_id = target_group_id and invitee_id = member_id and status = 'pending';
  delete from public.group_members where group_id = target_group_id and user_id = member_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Only the owner can rename a group or change its currency
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists "groups update as member" on public.groups;
drop policy if exists "groups update as owner" on public.groups;
create policy "groups update as owner" on public.groups for update to authenticated
  using (public.is_group_owner(id)) with check (public.is_group_owner(id));

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------------------------------------------

revoke execute on function public.guard_linked_person_removal() from public, anon, authenticated;
revoke execute on function public.expire_invitations(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.invite_by_username(uuid, uuid, text) from public, anon;
revoke execute on function public.accept_invitation(uuid) from public, anon;
revoke execute on function public.decline_invitation(uuid) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.list_my_invitations() from public, anon;
revoke execute on function public.list_group_invitations(uuid) from public, anon;
revoke execute on function public.list_members(uuid) from public, anon;
revoke execute on function public.list_group_members(uuid) from public, anon;
revoke execute on function public.invite_member(uuid, text) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.invite_by_username(uuid, uuid, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.decline_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.list_my_invitations() to authenticated;
grant execute on function public.list_group_invitations(uuid) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.list_group_members(uuid) to authenticated;
grant execute on function public.invite_member(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

commit;
