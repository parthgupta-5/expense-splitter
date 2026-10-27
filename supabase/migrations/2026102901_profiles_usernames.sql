-- Usernames (@handles) so people can find each other later. Run AFTER 2026102801_import_checks_split_total.sql.
-- Safe to re-run. Rollback: supabase/rollbacks/2026102901_profiles_usernames.down.sql.
--
-- A username is a public label, never an identity: ownership, membership and every policy keep using auth.users.id.
-- Every profile gets a provisional `user_xxxxxxxx` name; the app then asks its owner to choose one. Clients cannot
-- write username columns: they change only through set_username(), which applies the format, reserved-name,
-- uniqueness, 30-day change and 30-day hold rules, and is rate limited.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Columns and supporting tables
-- ---------------------------------------------------------------------------------------------------------------

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists username_confirmed_at timestamptz; -- null while provisional
alter table public.profiles add column if not exists username_changed_at timestamptz;   -- last change of a chosen name

-- Names nobody may choose. Not readable by clients; check_username() reports them as 'reserved'.
create table if not exists public.reserved_usernames (
  name text primary key check (name ~ '^[a-z][a-z0-9_]*$')
);
insert into public.reserved_usernames (name) values
  ('admin'), ('administrator'), ('root'), ('system'), ('support'), ('help'), ('security'), ('staff'), ('team'),
  ('official'), ('moderator'), ('mod'), ('owner'), ('billing'), ('api'), ('auth'), ('login'), ('logout'), ('signin'),
  ('signup'), ('settings'), ('profile'), ('account'), ('groups'), ('group'), ('history'), ('people'), ('invite'),
  ('invites'), ('notifications'), ('me'), ('you'), ('everyone'), ('all'), ('guest'), ('anonymous'), ('null'),
  ('undefined'), ('expense'), ('expenses'), ('splitter'), ('expensesplitter'), ('supabase'), ('google'), ('www'),
  ('mail'), ('email'), ('user'), ('username'), ('test')
on conflict (name) do nothing;

-- A chosen name that its owner gave up stays unavailable to everyone else for 30 days (only the owner can reclaim it),
-- so nobody can take over a handle that friends still know.
create table if not exists public.released_usernames (
  username text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  released_at timestamptz not null default now()
);

-- Fixed-window counters for throttle(). One row per user and action.
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  primary key (user_id, action)
);

alter table public.reserved_usernames enable row level security;
alter table public.released_usernames enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.reserved_usernames, public.released_usernames, public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Rules
-- ---------------------------------------------------------------------------------------------------------------

-- Trims, removes one leading @ and lowercases. Anything that is not then a plain ASCII name fails username_problem().
create or replace function public.normalize_username(candidate text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(btrim(coalesce(candidate, '')), '^@', ''));
$$;

-- 'invalid', 'reserved' or null. ASCII only (octet_length = length), so Unicode look-alikes are rejected.
create or replace function public.username_problem(candidate text)
returns text language sql stable set search_path = public as $$
  select case
    when candidate is null
      or octet_length(candidate) <> length(candidate)
      or candidate !~ '^[a-z][a-z0-9_]{2,19}$' then 'invalid'
    when left(candidate, 5) = 'user_' then 'reserved'
    when exists (select 1 from public.reserved_usernames r where r.name = candidate) then 'reserved'
  end;
$$;

-- True when someone other than `me` has the name, or released it less than 30 days ago.
create or replace function public.username_unavailable(candidate text, me uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.username = candidate and p.id is distinct from me)
    or exists (
      select 1 from public.released_usernames r
      where r.username = candidate and r.user_id is distinct from me and r.released_at > now() - interval '30 days'
    );
$$;

-- Raises "Too many attempts" when the caller used `action_name` more than `max_hits` times in the current window.
-- When it raises, the transaction (and this count) rolls back, but the stored count is already at the limit, so the
-- caller stays blocked until the window ends.
create or replace function public.throttle(action_name text, max_hits integer, per interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.rate_limits as r (user_id, action, window_start, hits)
  values (auth.uid(), action_name, now(), 1)
  on conflict (user_id, action) do update set
    hits = case when r.window_start <= now() - per then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - per then now() else r.window_start end
  returning hits into used;
  if used > max_hits then
    raise exception 'Too many attempts. Please wait a few minutes and try again.' using errcode = 'P0001';
  end if;
end;
$$;

-- A unique `user_` + 8 hex characters (12 if 8 keeps colliding). `user_` names are reserved, so nobody can choose one.
create or replace function public.provisional_username()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  candidate text;
begin
  for attempt in 1..20 loop
    candidate := 'user_' || substr(md5(gen_random_uuid()::text), 1, case when attempt <= 10 then 8 else 12 end);
    if not exists (select 1 from public.profiles where username = candidate) then
      return candidate;
    end if;
  end loop;
  return 'user_' || substr(md5(gen_random_uuid()::text), 1, 15);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Backfill, then constraints
-- ---------------------------------------------------------------------------------------------------------------

-- Lets this migration (and set_username) write the username columns past the guard trigger below.
select set_config('app.username_change', 'on', true);

-- Any account that somehow has no profile row gets one (the sign-up trigger normally creates it).
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

update public.profiles set username = public.provisional_username() where username is null;

alter table public.profiles alter column username set not null;
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (octet_length(username) = length(username) and username ~ '^[a-z][a-z0-9_]{2,19}$');
-- Names are lowercase by the check above, so this unique index is also case-insensitive.
create unique index if not exists profiles_username_key on public.profiles (username);

select set_config('app.username_change', 'off', true);

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Triggers: new profiles get a provisional name; username columns change only through set_username()
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.assign_provisional_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.username_change', true), '') <> 'on' then
    new.username := null;
    new.username_confirmed_at := null;
    new.username_changed_at := null;
  end if;
  if new.username is null then
    new.username := public.provisional_username();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_username on public.profiles;
create trigger profiles_assign_username before insert on public.profiles
for each row execute function public.assign_provisional_username();

create or replace function public.protect_username()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.username, new.username_confirmed_at, new.username_changed_at)
       is distinct from (old.username, old.username_confirmed_at, old.username_changed_at)
     and coalesce(current_setting('app.username_change', true), '') <> 'on' then
    raise exception 'Change your username from Settings' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_username on public.profiles;
create trigger profiles_protect_username before update on public.profiles
for each row execute function public.protect_username();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Functions the app calls
-- ---------------------------------------------------------------------------------------------------------------

-- 'available' | 'yours' | 'taken' | 'invalid' | 'reserved'. Exact names only; reveals nothing about other accounts.
create or replace function public.check_username(candidate text)
returns text language plpgsql security definer set search_path = public as $$
declare
  name text := public.normalize_username(candidate);
  problem text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.throttle('check_username', 60, interval '10 minutes');
  problem := public.username_problem(name);
  if problem is not null then
    return problem;
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and username = name) then
    return 'yours';
  end if;
  return case when public.username_unavailable(name, auth.uid()) then 'taken' else 'available' end;
end;
$$;

-- An available name based on the caller's display name ("Asha Rao" -> "asharao" or "asharao4821"), or null.
create or replace function public.suggest_username()
returns text language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.throttle('check_username', 60, interval '10 minutes');
  select left(regexp_replace(regexp_replace(lower(display_name), '[^a-z0-9]', '', 'g'), '^[0-9]+', ''), 14)
    into base from public.profiles where id = auth.uid();
  if coalesce(length(base), 0) < 3 then
    base := 'friend';
  end if;
  candidate := base;
  for attempt in 1..25 loop
    if public.username_problem(candidate) is null and not public.username_unavailable(candidate, auth.uid()) then
      return candidate;
    end if;
    candidate := base || (1000 + floor(random() * 9000))::int::text;
  end loop;
  return null;
end;
$$;

-- Sets the caller's username. Replacing the provisional name is always allowed. Changing a chosen name is allowed
-- once per 30 days, and the old name is held for 30 days; taking back your own held name is an undo and is exempt.
-- Returns the new username fields, or { "error": message } when a rule is not met. Rule failures are returned rather
-- than raised so the attempt still counts towards the rate limit (a raised error would roll the count back).
create or replace function public.set_username(new_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  name text := public.normalize_username(new_username);
  problem text := public.username_problem(public.normalize_username(new_username));
  reclaim boolean;
  given_up text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.throttle('set_username', 10, interval '1 hour');
  if problem = 'invalid' then
    return jsonb_build_object('error', 'Use 3–20 characters: lowercase letters, numbers or _, starting with a letter');
  elsif problem = 'reserved' then
    return jsonb_build_object('error', 'That username is reserved');
  end if;

  select * into me from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Your profile was not found. Sign out and in again.' using errcode = 'P0002';
  end if;
  if me.username = name and me.username_confirmed_at is not null then
    return jsonb_build_object('username', me.username, 'username_confirmed_at', me.username_confirmed_at,
      'username_changed_at', me.username_changed_at);
  end if;

  reclaim := exists (
    select 1 from public.released_usernames
    where username = name and user_id = auth.uid() and released_at > now() - interval '30 days'
  );
  if me.username_confirmed_at is not null and not reclaim
     and me.username_changed_at is not null and me.username_changed_at > now() - interval '30 days' then
    return jsonb_build_object('error', 'You can change your username again on '
      || to_char(me.username_changed_at + interval '30 days', 'FMDD Mon YYYY'));
  end if;
  if public.username_unavailable(name, auth.uid()) then
    return jsonb_build_object('error', 'That username is taken');
  end if;

  -- Only a chosen name is held; provisional user_ names are reserved, so nobody could take them anyway.
  given_up := case when me.username_confirmed_at is not null then me.username end;

  begin
    perform set_config('app.username_change', 'on', true);
    update public.profiles set
      username = name,
      username_confirmed_at = coalesce(me.username_confirmed_at, now()),
      username_changed_at = case
        when me.username_confirmed_at is null or reclaim then me.username_changed_at else now() end
    where id = auth.uid()
    returning * into me;
  exception
    when unique_violation then -- someone took it at the same moment
      return jsonb_build_object('error', 'That username is taken');
  end;
  perform set_config('app.username_change', 'off', true);

  -- The hold starts at the change being made (or, for an undo, the change being undone), so swapping back and forth
  -- never keeps a second name held past that change's 30 days.
  delete from public.released_usernames where username = name and user_id = auth.uid();
  if given_up is not null then
    insert into public.released_usernames (username, user_id, released_at)
    values (given_up, auth.uid(), coalesce(me.username_changed_at, now()))
    on conflict (username) do update set user_id = excluded.user_id, released_at = excluded.released_at;
  end if;
  return jsonb_build_object('username', me.username, 'username_confirmed_at', me.username_confirmed_at,
    'username_changed_at', me.username_changed_at);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Privileges: profiles stay readable only by their owner; clients may write only these columns
-- ---------------------------------------------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- id, avatar_url and updated_at stay writable so the app version already deployed can keep saving its profile with
-- upsert while this rolls out. RLS still pins id to the caller and a trigger sets updated_at.
grant insert (id, display_name, avatar_url, currency_code, preferences, saved_people, updated_at)
  on public.profiles to authenticated;
grant update (id, display_name, avatar_url, currency_code, preferences, saved_people, updated_at)
  on public.profiles to authenticated;

revoke execute on function public.normalize_username(text) from public, anon, authenticated;
revoke execute on function public.username_problem(text) from public, anon, authenticated;
revoke execute on function public.username_unavailable(text, uuid) from public, anon, authenticated;
revoke execute on function public.throttle(text, integer, interval) from public, anon, authenticated;
revoke execute on function public.provisional_username() from public, anon, authenticated;
revoke execute on function public.check_username(text) from public, anon;
revoke execute on function public.suggest_username() from public, anon;
revoke execute on function public.set_username(text) from public, anon;
grant execute on function public.check_username(text) to authenticated;
grant execute on function public.suggest_username() to authenticated;
grant execute on function public.set_username(text) to authenticated;

commit;
