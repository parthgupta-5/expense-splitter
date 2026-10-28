-- People, invitations and account deletion. Run AFTER 2026103101_username_invitations.sql. Safe to re-run.
-- Rollback: supabase/rollbacks/2026110101_people_invites_account_deletion.down.sql.
--
-- 1. A group created through create_group() starts with its creator as a person linked to their account. Groups made
--    before this (or imported from a device) are not changed: their owner can add or link themselves with
--    add_me_to_group(). The owner may remove their own person from the expenses (the open-balance rule still applies).
-- 2. The owner adds an account by @username in one step: add_person_by_username() creates the person and the pending
--    invitation together. The person can be used in expenses at once; the account gets no access until it accepts, and
--    accepting links that same person (accept_invitation() is unchanged). find_invitee() shows who a username is
--    before adding. After a decline, revoke or expiry the person stays; keep_person_as_guest() closes the matter.
-- 3. list_group_people() gives every member each person's status (member, invitation pending, guest); the owner also
--    sees the invitation details.
-- 4. invitation_updates holds one timestamp per account, bumped whenever an invitation to them (or in a group they
--    own) changes. The app listens to it on its existing realtime channel; it contains no invitation data.
-- 5. Account deletion. account_deletion_blockers() lists the caller's own groups that other members use. Deleting an
--    auth user (done only by the delete-account Edge Function or the Dashboard) runs prepare_account_deletion() first,
--    in the same transaction: it refuses while the account owns a shared group, deletes the account's other groups,
--    unlinks its people and memberships everywhere else, and removes its name from the shared activity history.
--    This also fixes two existing problems with deleting a user: expenses kept the deleted account's id (the
--    validation trigger undid "on delete set null"), and an account that had recorded a payment could not be deleted.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------------------------------------------

-- "Keep as guest" for an answered invitation: the owner has dealt with it, so it no longer shows on the person.
alter table public.group_invitations add column if not exists cleared_at timestamptz;

-- The name an account appears under when it becomes a person: its display name (spaces tidied, at most 40
-- characters), or its @username when it has none.
create or replace function public.person_label(target_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(btrim(left(regexp_replace(btrim(coalesce(p.display_name, '')), '\s+', ' ', 'g'), 40)), ''),
    p.username
  )
  from public.profiles p where p.id = target_user;
$$;

-- A person name for this account that nobody in the group has yet (names are unique, ignoring case): the label, then
-- "label (@username)", then "@username". Null when all three are taken.
create or replace function public.free_person_name(target_group_id uuid, target_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  label text := public.person_label(target_user);
  handle text := (select username from public.profiles where id = target_user);
  candidate text;
begin
  foreach candidate in array array[
    label,
    btrim(left(label, 40 - length(handle) - 4)) || ' (@' || handle || ')',
    '@' || handle
  ] loop
    if candidate is not null and not exists (
      select 1 from public.group_people where group_id = target_group_id and lower(name) = lower(candidate)
    ) then
      return candidate;
    end if;
  end loop;
  return null;
end;
$$;

-- The account's own profile photo URL, or null for anything else (an old free-form link). Same shape as
-- check_avatar_url() in 2026103001_avatar_storage.sql.
create or replace function public.safe_avatar_url(target_user uuid, url text)
returns text language sql immutable set search_path = public as $$
  select case when url ~ (
    '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/avatars/' || target_user::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  ) then url end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The creator as a person
-- ---------------------------------------------------------------------------------------------------------------

-- Creates a group owned by the caller with the caller as its first person, in one transaction.
create or replace function public.create_group(new_group_id uuid, new_name text, new_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  created uuid;
  person record;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.groups (id, name, created_by, currency_code)
  values (coalesce(new_group_id, gen_random_uuid()), btrim(coalesce(new_name, '')), me, coalesce(new_currency, 'INR'))
  returning id into created;
  insert into public.group_people (group_id, name, user_id)
  values (created, coalesce(public.person_label(me), 'Organizer'), me)
  returning id, name into person;
  return jsonb_build_object('id', created, 'person_id', person.id, 'person_name', person.name);
end;
$$;

-- Owner only: adds the caller to their own group as a new person, or links them to an existing unlinked person
-- (target_person_id). Returns { person_id, person_name } or { error }.
create or replace function public.add_me_to_group(target_group_id uuid, target_person_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  existing text;
  person record;
  label text;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_group_owner(target_group_id) then
    raise exception 'Only the group owner can do this' using errcode = '42501';
  end if;
  perform 1 from public.groups where id = target_group_id for update;
  select name into existing from public.group_people where group_id = target_group_id and user_id = me;
  if existing is not null then
    return jsonb_build_object('error', 'You are already in this group as ' || existing);
  end if;

  if target_person_id is not null then
    select p.id, p.name, p.user_id into person
    from public.group_people p where p.id = target_person_id and p.group_id = target_group_id
    for update;
    if not found then
      return jsonb_build_object('error', 'Choose a person from this group');
    end if;
    if person.user_id is not null then
      return jsonb_build_object('error', person.name || ' is already linked to an account');
    end if;
    if exists (select 1 from public.group_invitations where person_id = person.id and status = 'pending') then
      return jsonb_build_object('error', person.name || ' has a pending invitation. Revoke it first.');
    end if;
    update public.group_people set user_id = me where id = person.id;
    update public.group_invitations set cleared_at = coalesce(cleared_at, now()) where person_id = person.id;
    return jsonb_build_object('person_id', person.id, 'person_name', person.name);
  end if;

  label := coalesce(public.person_label(me), 'Organizer');
  if exists (select 1 from public.group_people where group_id = target_group_id and lower(name) = lower(label)) then
    return jsonb_build_object('error',
      'Someone called ' || label || ' is already in this group. If that is you, link yourself to them instead.');
  end if;
  insert into public.group_people (group_id, name, user_id) values (target_group_id, label, me)
  returning id, name into person;
  return jsonb_build_object('person_id', person.id, 'person_name', person.name);
end;
$$;

-- A person linked to an account stays until that member leaves or is removed, except that the owner may take their
-- own person out of the expenses (guard_person_removal() still refuses while they owe or are owed money).
create or replace function public.guard_linked_person_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.user_id is not null and exists (select 1 from public.groups where id = old.group_id)
     and not (old.user_id = auth.uid() and public.is_group_owner(old.group_id)) then
    raise exception '% is linked to a member''s account. Remove that member from the group first.', old.name
      using errcode = '23514';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Adding people by username
-- ---------------------------------------------------------------------------------------------------------------

-- Owner only, rate limited, exact usernames only. Says who a username is (display name, @username, own photo; never
-- an email) and where they stand with this group, so the owner can confirm before adding. Returns { status, ... }:
-- 'invalid' | 'not_found' | 'self' | 'member' | 'pending' | 'cooldown' | 'invited_before' | 'available'.
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

-- Owner only. Adds the account with this @username as a new person and invites it to be that person, in one
-- transaction: the person can be used in expenses straight away, the account gets access only by accepting.
-- Returns the new person and invitation, or { error } (returned, not raised, so it counts towards the rate limit).
create or replace function public.add_person_by_username(target_group_id uuid, invitee_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  handle text := public.normalize_username(invitee_username);
  invitee record;
  linked text;
  waiting text;
  declined_at timestamptz;
  previous text;
  person_name text;
  person record;
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

  select pr.id, pr.username, pr.display_name into invitee
  from public.profiles pr
  where public.username_problem(handle) is distinct from 'invalid'
    and pr.username = handle and pr.username_confirmed_at is not null;
  if not found then
    return jsonb_build_object('error', 'No account has that username');
  end if;
  select name into linked from public.group_people where group_id = target_group_id and user_id = invitee.id;
  if invitee.id = me then
    return jsonb_build_object('error', case when linked is null
      then 'That is you. Use "Add yourself" to join the expenses.' else 'You are already in this group as ' || linked end);
  end if;
  if linked is not null then
    return jsonb_build_object('error', '@' || invitee.username || ' is already in this group as ' || linked);
  end if;

  perform public.expire_invitations(target_group_id, null, null);
  select p.name into waiting from public.group_invitations i join public.group_people p on p.id = i.person_id
  where i.group_id = target_group_id and i.invitee_id = invitee.id and i.status = 'pending';
  if waiting is not null then
    return jsonb_build_object('error', '@' || invitee.username || ' already has a pending invitation (as ' || waiting || ')');
  end if;
  select max(responded_at) into declined_at from public.group_invitations
  where group_id = target_group_id and invitee_id = invitee.id and status = 'declined';
  if declined_at > now() - interval '7 days' then
    return jsonb_build_object('error', '@' || invitee.username || ' declined recently. You can invite them again on '
      || to_char(declined_at + interval '7 days', 'FMDD Mon YYYY'));
  end if;
  select p.name into previous
  from public.group_invitations i join public.group_people p on p.id = i.person_id
  where i.group_id = target_group_id and i.invitee_id = invitee.id and p.user_id is null and i.cleared_at is null
  order by i.created_at desc limit 1;
  if previous is not null then
    return jsonb_build_object('error', '@' || invitee.username || ' was invited before as ' || previous
      || '. Use Resend on ' || previous || ' in the people list.');
  end if;
  if (select count(*) from public.group_invitations where group_id = target_group_id and status = 'pending') >= 20 then
    return jsonb_build_object('error',
      'This group already has 20 pending invitations. Revoke some, or wait for answers.');
  end if;
  person_name := public.free_person_name(target_group_id, invitee.id);
  if person_name is null then
    return jsonb_build_object('error', 'Their name is already used in this group. Rename or remove that person first.');
  end if;

  begin
    insert into public.group_people (group_id, name) values (target_group_id, person_name)
    returning id, name into person;
    insert into public.group_invitations (group_id, person_id, invitee_id, invited_by)
    values (target_group_id, person.id, invitee.id, me)
    returning id, expires_at into created;
  exception
    when unique_violation then -- someone added the same name at the same moment
      return jsonb_build_object('error', 'Someone else just changed this group. Please try again.');
  end;
  return jsonb_build_object(
    'person_id', person.id, 'person_name', person.name, 'invitation_id', created.id, 'status', 'pending',
    'username', invitee.username, 'display_name', coalesce(invitee.display_name, ''), 'expires_at', created.expires_at
  );
end;
$$;

-- Owner only. The person stays as a guest: a pending invitation for them is revoked, and earlier answers stop
-- showing. Returns { status: 'guest' } or { error }.
create or replace function public.keep_person_as_guest(target_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  person record;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select p.id, p.group_id, p.name, p.user_id into person from public.group_people p where p.id = target_person_id;
  if not found or not public.is_group_owner(person.group_id) then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  if person.user_id is not null then
    return jsonb_build_object('error', person.name || ' is linked to an account');
  end if;
  update public.group_invitations set status = 'revoked', responded_at = now()
  where person_id = person.id and status = 'pending';
  update public.group_invitations set cleared_at = now() where person_id = person.id and cleared_at is null;
  return jsonb_build_object('status', 'guest');
end;
$$;

-- Members only. Every person in the group with what they are: linked to a member (with that member's role,
-- @username, display name and own photo), invited (status 'pending'), or a guest. The owner also sees the latest
-- answered invitation (declined, expired or revoked, until cleared) and who it was for. No emails.
create or replace function public.list_group_people(target_group_id uuid)
returns table (
  person_id uuid, name text, user_id uuid, member_role text, username text, display_name text, avatar_url text,
  invitation_id uuid, invitation_status text, invitee_username text, invitee_name text, expires_at timestamptz,
  responded_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  owner boolean := public.is_group_owner(target_group_id);
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  perform public.expire_invitations(target_group_id, null, null);
  return query
    select p.id, p.name, p.user_id, gm.role, pr.username, coalesce(pr.display_name, ''),
      public.safe_avatar_url(pr.id, pr.avatar_url),
      case when owner then inv.id end,
      case when owner or inv.status = 'pending' then inv.status end,
      case when owner then iu.username end,
      case when owner then coalesce(iu.display_name, '') end,
      case when owner or inv.status = 'pending' then inv.expires_at end,
      case when owner then inv.responded_at end
    from public.group_people p
    left join public.group_members gm on gm.group_id = p.group_id and gm.user_id = p.user_id
    left join public.profiles pr on pr.id = gm.user_id
    left join lateral (
      select i.* from public.group_invitations i
      where i.person_id = p.id and p.user_id is null and i.cleared_at is null
      order by (i.status = 'pending') desc, i.created_at desc limit 1
    ) inv on true
    left join public.profiles iu on iu.id = inv.invitee_id
    where p.group_id = target_group_id
    order by p.created_at, p.name;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Live invitation signals
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.invitation_updates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table public.invitation_updates enable row level security;
revoke all on public.invitation_updates from anon, authenticated;
grant select on public.invitation_updates to authenticated;
drop policy if exists "invitation updates read own" on public.invitation_updates;
create policy "invitation updates read own" on public.invitation_updates for select to authenticated
  using (user_id = auth.uid());

create or replace function public.bump_invitation_update(target_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.invitation_updates (user_id, changed_at) values (target_user, clock_timestamp())
  on conflict (user_id) do update set changed_at = excluded.changed_at;
$$;

-- The invitee hears about every change to an invitation sent to them; the group's owner about answers and expiry.
create or replace function public.signal_invitation_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if tg_op = 'DELETE' then
    -- A pending invitation removed with its person or group. Not when the invitee's own account is being deleted.
    if old.status = 'pending' and exists (select 1 from auth.users where id = old.invitee_id) then
      perform public.bump_invitation_update(old.invitee_id);
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.cleared_at is not distinct from old.cleared_at then
    return null;
  end if;
  perform public.bump_invitation_update(new.invitee_id);
  select created_by into owner from public.groups where id = new.group_id;
  if owner is not null then
    perform public.bump_invitation_update(owner);
  end if;
  return null;
end;
$$;

drop trigger if exists group_invitations_signal on public.group_invitations;
create trigger group_invitations_signal after insert or update or delete on public.group_invitations
for each row execute function public.signal_invitation_change();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invitation_updates'
  ) then
    alter publication supabase_realtime add table public.invitation_updates;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Account deletion
-- ---------------------------------------------------------------------------------------------------------------

-- prepare_account_deletion() turns this on for its own transaction only (like app.bulk_import for import_group()).
create or replace function public.is_account_deletion()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('app.account_deletion', true), '') = 'on';
$$;

-- As in 2026102801_import_checks_split_total.sql, plus one case: while an account is being deleted, the only change an
-- update can make is clearing created_by. Before this, the trigger put the deleted account's id back, so the foreign
-- key's "on delete set null" left expenses pointing at an account that no longer existed.
create or replace function public.validate_expense()
returns trigger language plpgsql set search_path = public as $$
declare
  share record;
  total bigint := 0;
  bulk boolean := public.is_bulk_import();
begin
  if tg_op = 'UPDATE' and public.is_account_deletion() then
    new := old;
    new.created_by := null;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id then
      raise exception 'An expense cannot be moved to another group' using errcode = '23514';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_at := now();
  new.description := btrim(new.description);

  if not bulk and not public.is_group_person(new.group_id, new.payer) then
    raise exception '% is not in this group', new.payer using errcode = '23514';
  end if;
  if new.split_details = '{}'::jsonb then
    raise exception 'Choose at least one person to split between' using errcode = '23514';
  end if;
  for share in select key, value from jsonb_each(new.split_details) loop
    if jsonb_typeof(share.value) <> 'number'
      or (share.value #>> '{}')::numeric <> trunc((share.value #>> '{}')::numeric)
      or (share.value #>> '{}')::numeric < 0 then
      raise exception 'Split amounts must be whole, non-negative cents' using errcode = '23514';
    end if;
    if not bulk and not public.is_group_person(new.group_id, share.key) then
      raise exception '% is not in this group', share.key using errcode = '23514';
    end if;
    total := total + (share.value #>> '{}')::bigint;
  end loop;
  if total <> new.amount_cents then
    raise exception 'Split amounts must add up to the expense total' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- As in 2026102701_normalize_and_share.sql, with the same single exception. Before this, deleting an account that had
-- ever recorded a payment failed, because "on delete set null" is an update and payments refuse every update.
create or replace function public.validate_payment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and public.is_account_deletion() then
    new := old;
    new.created_by := null;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Payments cannot be edited. Delete it and record it again.' using errcode = '23514';
  end if;
  new.created_by := coalesce(auth.uid(), new.created_by);
  if public.is_bulk_import() then
    return new;
  end if;
  if not public.is_group_person(new.group_id, new.payer) then
    raise exception '% is not in this group', new.payer using errcode = '23514';
  end if;
  if not public.is_group_person(new.group_id, new.payee) then
    raise exception '% is not in this group', new.payee using errcode = '23514';
  end if;
  return new;
end;
$$;

-- As in 2026102701_normalize_and_share.sql, but silent while an account is being deleted: clearing who created a row
-- is not something the group did.
create or replace function public.write_activity(target_group_id uuid, action_name text, action_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_bulk_import() or public.is_account_deletion()
     or not exists (select 1 from public.groups where id = target_group_id) then
    return;
  end if;
  insert into public.activity_log (group_id, actor_id, actor_name, action, details)
  values (
    target_group_id,
    auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), ''),
    action_name,
    action_details
  );
end;
$$;

-- The caller's own groups that other members use. While there are any, the account cannot be deleted.
create or replace function public.account_deletion_blockers()
returns table (group_id uuid, group_name text, member_count integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return query
    select g.id, g.name, (select count(*) from public.group_members m where m.group_id = g.id)::integer
    from public.groups g
    where g.created_by = auth.uid()
      and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> g.created_by)
    order by g.name;
end;
$$;

-- Runs inside the same transaction as the deletion of an auth user, before the foreign keys cascade. Shared groups are
-- never deleted from under their members: the deletion fails instead. Everything else follows the documented policy.
create or replace function public.prepare_account_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  shared text;
begin
  -- Lock the account's groups first, so nobody can accept an invitation into one of them while this runs.
  perform 1 from public.groups where created_by = old.id for update;
  select string_agg(g.name, ', ' order by g.name) into shared
  from public.groups g
  where g.created_by = old.id
    and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> old.id);
  if shared is not null then
    raise exception 'This account owns groups that other members use (%). Delete those groups first.', shared
      using errcode = 'P0001';
  end if;

  -- Groups only this account uses go, with all their expenses, payments, snapshots, invitations and history.
  delete from public.groups where created_by = old.id;
  -- Elsewhere the account's person stays (other members' expenses and balances name it) but is no longer linked,
  -- and the account leaves those groups.
  update public.group_people set user_id = null where user_id = old.id;
  delete from public.group_members where user_id = old.id;
  -- From here on, rows only lose their link to this account (see validate_expense() and write_activity()). Doing it
  -- now leaves nothing for the foreign keys' "set null" to change.
  perform set_config('app.account_deletion', 'on', true);
  update public.expenses set created_by = null where created_by = old.id;
  update public.payments set created_by = null where created_by = old.id;
  update public.saved_splits set created_by = null where created_by = old.id;
  -- Shared history keeps what happened but not who: the name is replaced and the account id removed.
  update public.activity_log set actor_name = 'Former member' where actor_id = old.id;
  update public.activity_log set details = details - 'user_id' - 'name' where details ->> 'user_id' = old.id::text;
  return old;
end;
$$;

drop trigger if exists before_auth_user_deleted_expense_splitter on auth.users;
create trigger before_auth_user_deleted_expense_splitter before delete on auth.users
for each row execute function public.prepare_account_deletion();

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------------------------------------------

revoke execute on function public.write_activity(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.person_label(uuid) from public, anon, authenticated;
revoke execute on function public.free_person_name(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.safe_avatar_url(uuid, text) from public, anon, authenticated;
revoke execute on function public.bump_invitation_update(uuid) from public, anon, authenticated;
revoke execute on function public.signal_invitation_change() from public, anon, authenticated;
revoke execute on function public.prepare_account_deletion() from public, anon, authenticated;
revoke execute on function public.guard_linked_person_removal() from public, anon, authenticated;
revoke execute on function public.create_group(uuid, text, text) from public, anon;
revoke execute on function public.add_me_to_group(uuid, uuid) from public, anon;
revoke execute on function public.find_invitee(uuid, text) from public, anon;
revoke execute on function public.add_person_by_username(uuid, text) from public, anon;
revoke execute on function public.keep_person_as_guest(uuid) from public, anon;
revoke execute on function public.list_group_people(uuid) from public, anon;
revoke execute on function public.account_deletion_blockers() from public, anon;
grant execute on function public.create_group(uuid, text, text) to authenticated;
grant execute on function public.add_me_to_group(uuid, uuid) to authenticated;
grant execute on function public.find_invitee(uuid, text) to authenticated;
grant execute on function public.add_person_by_username(uuid, text) to authenticated;
grant execute on function public.keep_person_as_guest(uuid) to authenticated;
grant execute on function public.list_group_people(uuid) to authenticated;
grant execute on function public.account_deletion_blockers() to authenticated;

commit;
