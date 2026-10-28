-- Rollback for supabase/migrations/2026110101_people_invites_account_deletion.sql. Run by hand in the SQL Editor only if
-- that migration must be undone, and deploy the previous app version first (the new app calls create_group()). Safe to
-- re-run.
--
-- It removes the new functions, the account-deletion trigger and the invitation signals, and restores the earlier rule
-- that a person linked to an account cannot be removed (not even the owner's own). It deletes no group data: people
-- added by username, their invitations, and owners linked to their own person all stay, so re-applying the migration
-- picks up where it left off. The cleared_at column on invitations is kept (it only hides answered invitations).
-- invitation_updates is dropped; it holds nothing but one timestamp per account.
--
-- Without the trigger, deleting a user from the Dashboard goes back to the plain foreign-key behaviour: every group
-- that user created is deleted, shared or not, and the earlier validate_expense(), validate_payment() and
-- write_activity() come back (so deleting a user who recorded a payment fails again). Do not delete users while this is
-- rolled back.

begin;

drop trigger if exists before_auth_user_deleted_expense_splitter on auth.users;
drop function if exists public.prepare_account_deletion();
drop function if exists public.account_deletion_blockers();

-- validate_expense() as in 2026102801_import_checks_split_total.sql; validate_payment() and write_activity() as in
-- 2026102701_normalize_and_share.sql. Then the account-deletion switch they used can go.
create or replace function public.validate_expense()
returns trigger language plpgsql set search_path = public as $$
declare
  share record;
  total bigint := 0;
  bulk boolean := public.is_bulk_import();
begin
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

create or replace function public.validate_payment()
returns trigger language plpgsql set search_path = public as $$
begin
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

create or replace function public.write_activity(target_group_id uuid, action_name text, action_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_bulk_import() or not exists (select 1 from public.groups where id = target_group_id) then
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
revoke execute on function public.write_activity(uuid, text, jsonb) from public, anon, authenticated;
drop function if exists public.is_account_deletion();

drop trigger if exists group_invitations_signal on public.group_invitations;
drop function if exists public.signal_invitation_change();
drop function if exists public.bump_invitation_update(uuid);
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invitation_updates'
  ) then
    alter publication supabase_realtime drop table public.invitation_updates;
  end if;
end;
$$;
drop table if exists public.invitation_updates;

drop function if exists public.list_group_people(uuid);
drop function if exists public.keep_person_as_guest(uuid);
drop function if exists public.add_person_by_username(uuid, text);
drop function if exists public.find_invitee(uuid, text);
drop function if exists public.add_me_to_group(uuid, uuid);
drop function if exists public.create_group(uuid, text, text);
drop function if exists public.safe_avatar_url(uuid, text);
drop function if exists public.free_person_name(uuid, uuid);
drop function if exists public.person_label(uuid);

-- As in 2026103101_username_invitations.sql.
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
revoke execute on function public.guard_linked_person_removal() from public, anon, authenticated;

commit;
