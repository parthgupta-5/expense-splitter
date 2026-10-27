-- Rollback for supabase/migrations/2026103001_avatar_storage.sql. Run by hand in the SQL Editor only if that migration
-- must be undone. Safe to re-run.
--
-- It removes the avatar Storage policies and the avatar_url check, and makes the bucket private so photos stop being
-- served (the app then shows initials). It deletes no files and no profile data: re-applying the migration brings
-- every photo back. To delete the photos for good, empty and delete the bucket in Dashboard -> Storage.

begin;

drop policy if exists "avatars: read own" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: update own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;
drop function if exists public.is_own_avatar_object(text);

drop trigger if exists profiles_check_avatar_url on public.profiles;
drop function if exists public.check_avatar_url();

update storage.buckets set public = false where id = 'avatars';

commit;
