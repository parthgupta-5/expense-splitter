-- Rollback for supabase/migrations/2026102901_profiles_usernames.sql. Run by hand in the SQL Editor only if that
-- migration must be undone. Safe to re-run.
--
-- It removes the username rules, functions and triggers; the earlier app keeps every profile write it needs. It
-- keeps the username columns, their values and the list of held names, so running the migration again restores the
-- same usernames. It never touches groups, people, expenses, payments, snapshots or the activity log.

begin;

drop trigger if exists profiles_protect_username on public.profiles;
drop trigger if exists profiles_assign_username on public.profiles;

drop function if exists public.set_username(text);
drop function if exists public.suggest_username();
drop function if exists public.check_username(text);
drop function if exists public.protect_username();
drop function if exists public.assign_provisional_username();
drop function if exists public.provisional_username();
drop function if exists public.throttle(text, integer, interval);
drop function if exists public.username_unavailable(text, uuid);
drop function if exists public.username_problem(text);
drop function if exists public.normalize_username(text);

-- Without the assigning trigger, new profiles would have no username, so the column must accept null again.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles alter column username drop not null;
drop index if exists public.profiles_username_key;

drop table if exists public.rate_limits;
drop table if exists public.reserved_usernames;

-- Clients keep the column privileges the migration granted: every column the earlier app writes, but not the kept
-- username columns, so nobody can set an unchecked username while the rules are gone. RLS still limits every row to
-- its owner.
grant select on public.profiles to authenticated;
grant insert (id, display_name, avatar_url, currency_code, preferences, saved_people, updated_at)
  on public.profiles to authenticated;
grant update (id, display_name, avatar_url, currency_code, preferences, saved_people, updated_at)
  on public.profiles to authenticated;

commit;
