-- Expense Splitter v2: normalised tables, group sharing, server-side validation, activity log, realtime.
-- Run AFTER 2026102201_expense_splitter_core.sql and 2026102601_harden_groups.sql. Safe to re-run.
-- If groups still have the old `data` JSON column, its contents are moved into the new tables and the column is dropped.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------------------------

alter table public.groups add column if not exists currency_code text not null default 'INR';
alter table public.groups drop constraint if exists groups_currency_code_check;
alter table public.groups add constraint groups_currency_code_check
  check (currency_code in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'));

-- People taking part in a group's expenses. They are names, not accounts: a group can include friends without one.
create table if not exists public.group_people (
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (group_id, name)
);
create unique index if not exists group_people_name_ci_idx on public.group_people (group_id, lower(name));

-- Money is stored as integer cents (bigint), never as floating point.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents < 100000000000000),
  payer text not null,
  category text not null default 'Other' check (length(category) between 1 and 40),
  split_type text not null default 'equal' check (split_type in ('equal', 'unequal', 'shares', 'percentages')),
  split_details jsonb not null check (jsonb_typeof(split_details) = 'object'), -- { "person name": cents }
  participants text[] not null default '{}',
  split_values jsonb check (split_values is null or jsonb_typeof(split_values) = 'object'), -- raw form inputs
  note text not null default '' check (length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_group_created_idx on public.expenses (group_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  payer text not null,
  payee text not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents < 100000000000000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_different_people check (payer <> payee)
);
create index if not exists payments_group_created_idx on public.payments (group_id, created_at desc);

-- Point-in-time snapshots ("Save split"). Stored as a document because they are read-only records.
create table if not exists public.saved_splits (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 500000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  saved_at timestamptz not null default now()
);
create index if not exists saved_splits_group_idx on public.saved_splits (group_id, saved_at desc);

-- Written only by triggers (security definer). Clients can read the log of their own groups.
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_group_idx on public.activity_log (group_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Move v1 data (groups.data JSON) into the new tables, then drop the column
-- ---------------------------------------------------------------------------------------------------------------

create or replace function pg_temp.es_num(v jsonb) returns numeric language plpgsql immutable as $$
begin
  return (v #>> '{}')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function pg_temp.es_ts(v text) returns timestamptz language plpgsql immutable as $$
begin
  return coalesce(v::timestamptz, now());
exception when others then
  return now();
end;
$$;

create or replace function pg_temp.es_uuid(v text) returns uuid language sql immutable as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then v::uuid else gen_random_uuid() end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'groups' and column_name = 'data'
  ) then
    return;
  end if;

  insert into public.group_people (group_id, name, created_at)
  select g.id, left(btrim(p.value), 40), g.created_at
  from public.groups g
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(g.data -> 'people') = 'array' then g.data -> 'people' else '[]'::jsonb end
  ) as p(value)
  where btrim(p.value) <> ''
  on conflict do nothing;

  insert into public.expenses (
    id, group_id, description, amount_cents, payer, category, split_type, split_details,
    participants, split_values, note, created_by, created_at, updated_at
  )
  select
    pg_temp.es_uuid(e ->> 'id'),
    g.id,
    left(coalesce(nullif(btrim(e ->> 'description'), ''), 'Expense'), 120),
    round(pg_temp.es_num(e -> 'amount') * 100)::bigint,
    e ->> 'payer',
    left(coalesce(nullif(e ->> 'category', ''), 'Other'), 40),
    case when e ->> 'splitType' in ('equal', 'unequal', 'shares', 'percentages') then e ->> 'splitType' else 'equal' end,
    (select coalesce(jsonb_object_agg(d.key, round(coalesce(pg_temp.es_num(d.value), 0) * 100)::bigint), '{}'::jsonb)
       from jsonb_each(e -> 'splitDetails') d),
    case when jsonb_typeof(e -> 'participants') = 'array'
      then array(select jsonb_array_elements_text(e -> 'participants')) else '{}' end,
    case when jsonb_typeof(e -> 'splitValues') = 'object' then e -> 'splitValues' end,
    left(coalesce(e ->> 'note', ''), 200),
    g.created_by,
    pg_temp.es_ts(e ->> 'createdAt'),
    pg_temp.es_ts(coalesce(e ->> 'updatedAt', e ->> 'createdAt'))
  from public.groups g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.data -> 'expenses') = 'array' then g.data -> 'expenses' else '[]'::jsonb end
  ) as e
  where jsonb_typeof(e) = 'object'
    and jsonb_typeof(e -> 'splitDetails') = 'object'
    and coalesce(btrim(e ->> 'payer'), '') <> ''
    and pg_temp.es_num(e -> 'amount') > 0
    and pg_temp.es_num(e -> 'amount') < 1000000000000
  on conflict (id) do nothing;

  insert into public.payments (id, group_id, payer, payee, amount_cents, created_by, created_at)
  select
    pg_temp.es_uuid(p ->> 'id'), g.id, p ->> 'payer', p ->> 'payee',
    round(pg_temp.es_num(p -> 'amount') * 100)::bigint, g.created_by, pg_temp.es_ts(p ->> 'createdAt')
  from public.groups g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.data -> 'payments') = 'array' then g.data -> 'payments' else '[]'::jsonb end
  ) as p
  where jsonb_typeof(p) = 'object'
    and coalesce(btrim(p ->> 'payer'), '') <> ''
    and coalesce(btrim(p ->> 'payee'), '') <> ''
    and p ->> 'payer' <> p ->> 'payee'
    and pg_temp.es_num(p -> 'amount') > 0
    and pg_temp.es_num(p -> 'amount') < 1000000000000
  on conflict (id) do nothing;

  insert into public.saved_splits (id, group_id, data, created_by, saved_at)
  select pg_temp.es_uuid(s ->> 'id'), g.id, s - 'id', g.created_by, pg_temp.es_ts(s ->> 'savedAt')
  from public.groups g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.data -> 'savedSplits') = 'array' then g.data -> 'savedSplits' else '[]'::jsonb end
  ) as s
  where jsonb_typeof(s) = 'object'
  on conflict (id) do nothing;

  alter table public.groups drop column data;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Server-side rules (validation triggers and the balance function)
-- ---------------------------------------------------------------------------------------------------------------

-- import_group() turns this on for its own transaction only, so old data with removed people can be imported.
create or replace function public.is_bulk_import()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('app.bulk_import', true), '') = 'on';
$$;

create or replace function public.is_group_person(target_group_id uuid, person text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_people where group_id = target_group_id and name = person);
$$;

create or replace function public.validate_expense()
returns trigger language plpgsql set search_path = public as $$
declare
  share record;
  total bigint := 0;
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

  if public.is_bulk_import() then
    return new;
  end if;

  if not public.is_group_person(new.group_id, new.payer) then
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
    if not public.is_group_person(new.group_id, share.key) then
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

drop trigger if exists expenses_validate on public.expenses;
create trigger expenses_validate before insert or update on public.expenses
for each row execute function public.validate_expense();

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

drop trigger if exists payments_validate on public.payments;
create trigger payments_validate before insert or update on public.payments
for each row execute function public.validate_payment();

-- Net position per person in cents, same rules as computeBalances() in src/lib/splits.js:
-- positive = is owed money, negative = owes money. Runs with the caller's permissions (RLS applies).
create or replace function public.group_balances(target_group_id uuid)
returns table (name text, paid_cents bigint, share_cents bigint, balance_cents bigint)
language sql stable set search_path = public as $$
  with movements (name, paid, share, balance) as (
    select payer, amount_cents, 0::bigint, amount_cents from public.expenses where group_id = target_group_id
    union all
    select d.key, 0::bigint, (d.value #>> '{}')::bigint, -(d.value #>> '{}')::bigint
      from public.expenses e cross join lateral jsonb_each(e.split_details) d
      where e.group_id = target_group_id
    union all
    select payer, amount_cents, 0::bigint, amount_cents from public.payments where group_id = target_group_id
    union all
    select payee, 0::bigint, 0::bigint, -amount_cents from public.payments where group_id = target_group_id
  )
  select m.name, sum(m.paid)::bigint, sum(m.share)::bigint, sum(m.balance)::bigint
  from movements m group by m.name order by m.name;
$$;

-- A person who still owes or is owed money cannot be removed (the same rule the UI shows).
create or replace function public.guard_person_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The whole group is being deleted (cascade): nothing to protect.
  if not exists (select 1 from public.groups where id = old.group_id) then
    return old;
  end if;
  if exists (
    select 1 from public.group_balances(old.group_id) b where b.name = old.name and b.balance_cents <> 0
  ) then
    raise exception '% still owes or is owed money. Settle up before removing them.', old.name
      using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists group_people_guard_removal on public.group_people;
create trigger group_people_guard_removal before delete on public.group_people
for each row execute function public.guard_person_removal();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Activity log (written by triggers, so it cannot be faked by a client)
-- ---------------------------------------------------------------------------------------------------------------

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

create or replace function public.log_expense_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data public.expenses;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  perform public.write_activity(
    row_data.group_id,
    case tg_op when 'INSERT' then 'expense_added' when 'UPDATE' then 'expense_updated' else 'expense_deleted' end,
    jsonb_build_object(
      'description', row_data.description, 'amount_cents', row_data.amount_cents, 'payer', row_data.payer,
      'category', row_data.category
    )
  );
  return null;
end;
$$;

drop trigger if exists expenses_log on public.expenses;
create trigger expenses_log after insert or update or delete on public.expenses
for each row execute function public.log_expense_activity();

create or replace function public.log_payment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data public.payments;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  perform public.write_activity(
    row_data.group_id,
    case tg_op when 'INSERT' then 'payment_added' else 'payment_deleted' end,
    jsonb_build_object('payer', row_data.payer, 'payee', row_data.payee, 'amount_cents', row_data.amount_cents)
  );
  return null;
end;
$$;

drop trigger if exists payments_log on public.payments;
create trigger payments_log after insert or delete on public.payments
for each row execute function public.log_payment_activity();

create or replace function public.log_person_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data public.group_people;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  perform public.write_activity(
    row_data.group_id,
    case tg_op when 'INSERT' then 'person_added' else 'person_removed' end,
    jsonb_build_object('name', row_data.name)
  );
  return null;
end;
$$;

drop trigger if exists group_people_log on public.group_people;
create trigger group_people_log after insert or delete on public.group_people
for each row execute function public.log_person_activity();

create or replace function public.log_member_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data public.group_members;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  perform public.write_activity(
    row_data.group_id,
    case
      when tg_op = 'INSERT' and row_data.role = 'owner' then 'group_created'
      when tg_op = 'INSERT' then 'member_joined'
      else 'member_left'
    end,
    jsonb_build_object(
      'user_id', row_data.user_id,
      'name', coalesce((select display_name from public.profiles where id = row_data.user_id), '')
    )
  );
  return null;
end;
$$;

drop trigger if exists group_members_log on public.group_members;
create trigger group_members_log after insert or delete on public.group_members
for each row execute function public.log_member_activity();

create or replace function public.log_group_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name or new.currency_code is distinct from old.currency_code then
    perform public.write_activity(
      new.id, 'group_updated', jsonb_build_object('name', new.name, 'currency_code', new.currency_code)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists groups_log on public.groups;
create trigger groups_log after update on public.groups
for each row execute function public.log_group_activity();

create or replace function public.log_snapshot_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data public.saved_splits;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  perform public.write_activity(
    row_data.group_id, case tg_op when 'INSERT' then 'split_saved' else 'split_deleted' end, '{}'::jsonb
  );
  return null;
end;
$$;

drop trigger if exists saved_splits_log on public.saved_splits;
create trigger saved_splits_log after insert or delete on public.saved_splits
for each row execute function public.log_snapshot_activity();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Sharing (members are accounts; only these functions can change membership)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.is_group_owner(target_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.invite_member(target_group_id uuid, member_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_group_owner(target_group_id) then
    raise exception 'Only the group owner can invite people' using errcode = '42501';
  end if;
  select id into target_user from auth.users where lower(email) = lower(btrim(member_email)) limit 1;
  if target_user is null then
    raise exception 'No account uses that email yet. Ask them to sign up first, then invite them again.'
      using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = target_group_id and user_id = target_user) then
    raise exception 'That person is already a member of this group' using errcode = '23505';
  end if;
  insert into public.group_members (group_id, user_id, role) values (target_group_id, target_user, 'member');
  return jsonb_build_object(
    'user_id', target_user,
    'display_name', coalesce((select display_name from public.profiles where id = target_user), '')
  );
end;
$$;

create or replace function public.list_members(target_group_id uuid)
returns table (user_id uuid, role text, display_name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  return query
    select gm.user_id, gm.role, coalesce(p.display_name, ''), u.email::text, gm.joined_at
    from public.group_members gm
    join auth.users u on u.id = gm.user_id
    left join public.profiles p on p.id = gm.user_id
    where gm.group_id = target_group_id
    order by gm.role desc, gm.joined_at;
end;
$$;

-- The owner can remove anyone else; any member can remove themselves (leave). The owner cannot leave.
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
  delete from public.group_members where group_id = target_group_id and user_id = member_id;
end;
$$;

-- Copies a guest (device-only) group into the caller's account in one transaction.
-- Security definer so it can write the activity log; it only ever writes into the brand-new group it creates,
-- owned by the caller, so it cannot touch anyone else's data.
create or replace function public.import_group(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_group uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'object' or coalesce(btrim(payload ->> 'name'), '') = '' then
    raise exception 'This group has no name' using errcode = '22023';
  end if;
  perform set_config('app.bulk_import', 'on', true);

  insert into public.groups (id, name, created_by, currency_code)
  values (
    new_group, left(btrim(payload ->> 'name'), 80), auth.uid(),
    case when payload ->> 'currency_code' in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD')
      then payload ->> 'currency_code' else 'INR' end
  );

  insert into public.group_people (group_id, name)
  select new_group, left(btrim(value), 40)
  from jsonb_array_elements_text(coalesce(payload -> 'people', '[]'::jsonb))
  where btrim(value) <> ''
  on conflict do nothing;

  insert into public.expenses (
    group_id, description, amount_cents, payer, category, split_type, split_details,
    participants, split_values, note, created_at
  )
  select new_group, x.description, x.amount_cents, x.payer, coalesce(x.category, 'Other'), coalesce(x.split_type, 'equal'),
    x.split_details, coalesce(x.participants, '{}'), x.split_values, coalesce(x.note, ''), coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(payload -> 'expenses', '[]'::jsonb)) as x(
    description text, amount_cents bigint, payer text, category text, split_type text, split_details jsonb,
    participants text[], split_values jsonb, note text, created_at timestamptz
  );

  insert into public.payments (group_id, payer, payee, amount_cents, created_at)
  select new_group, x.payer, x.payee, x.amount_cents, coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(payload -> 'payments', '[]'::jsonb)) as x(
    payer text, payee text, amount_cents bigint, created_at timestamptz
  );

  insert into public.saved_splits (group_id, data, saved_at)
  select new_group, x.data, coalesce(x.saved_at, now())
  from jsonb_to_recordset(coalesce(payload -> 'saved_splits', '[]'::jsonb)) as x(data jsonb, saved_at timestamptz);

  perform set_config('app.bulk_import', 'off', true);
  perform public.write_activity(new_group, 'group_imported', jsonb_build_object('name', payload ->> 'name'));
  return new_group;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------------------------------------------

-- Fix: the owner must be able to read a group in the same statement that creates it. Membership is added by an
-- AFTER INSERT trigger, so `insert ... returning` (supabase-js .insert().select()) failed the old policy.
drop policy if exists "groups read as member" on public.groups;
create policy "groups read as member" on public.groups for select to authenticated
  using (created_by = auth.uid() or public.is_group_member(id));

alter table public.group_people enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.saved_splits enable row level security;
alter table public.activity_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['group_people', 'expenses', 'payments', 'saved_splits'] loop
    execute format('drop policy if exists "%s read as member" on public.%I', t, t);
    execute format('create policy "%s read as member" on public.%I for select to authenticated
      using (public.is_group_member(group_id))', t, t);
    execute format('drop policy if exists "%s insert as member" on public.%I', t, t);
    execute format('create policy "%s insert as member" on public.%I for insert to authenticated
      with check (public.is_group_member(group_id))', t, t);
    execute format('drop policy if exists "%s delete as member" on public.%I', t, t);
    execute format('create policy "%s delete as member" on public.%I for delete to authenticated
      using (public.is_group_member(group_id))', t, t);
  end loop;
end;
$$;

drop policy if exists "expenses update as member" on public.expenses;
create policy "expenses update as member" on public.expenses for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists "activity read as member" on public.activity_log;
create policy "activity read as member" on public.activity_log for select to authenticated
  using (public.is_group_member(group_id));

-- Membership changes only through invite_member() / remove_member().
drop policy if exists "owners add members" on public.group_members;
revoke insert, update, delete on public.group_members from authenticated, anon;

revoke all on public.group_people, public.expenses, public.payments, public.saved_splits, public.activity_log
  from anon;
grant select, insert, delete on public.group_people, public.payments, public.saved_splits to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select on public.activity_log to authenticated;

-- Functions are callable by signed-in users only.
revoke execute on function public.invite_member(uuid, text) from public, anon;
revoke execute on function public.list_members(uuid) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.import_group(jsonb) from public, anon;
revoke execute on function public.group_balances(uuid) from public, anon;
revoke execute on function public.write_activity(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.invite_member(uuid, text) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.import_group(jsonb) to authenticated;
grant execute on function public.group_balances(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Realtime: clients listen to the activity log (RLS-filtered) and to group deletions
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['activity_log', 'groups'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
