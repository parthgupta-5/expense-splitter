-- Hardening for groups/profiles. Run AFTER 2026102201_expense_splitter_core.sql. Safe to run repeatedly.

-- 1. created_by is the ownership anchor: nobody may change it after insert.
create or replace function public.prevent_created_by_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_lock_created_by on public.groups;
create trigger groups_lock_created_by
before update on public.groups
for each row execute function public.prevent_created_by_change();

-- 2. updated_at is set by the server, not trusted from the client.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists groups_touch_updated_at on public.groups;
create trigger groups_touch_updated_at
before update on public.groups
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();
