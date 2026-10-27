-- Profile photos in Supabase Storage. Run AFTER 2026102901_profiles_usernames.sql. Safe to re-run.
-- Rollback: supabase/rollbacks/2026103001_avatar_storage.down.sql.
--
-- Bucket `avatars` is public (approved), so a photo is served by its URL without signing in. Nobody can list the
-- bucket. Each photo lives at <auth user id>/<random v4 uuid>.jpg: the folder proves who owns it and the uuid makes
-- the address unguessable. Only that signed-in user can create, change or delete objects in their own folder, and
-- only with exactly that name shape. The app re-encodes every photo to a small JPEG before upload, so the bucket
-- accepts nothing else.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- True when `object_name` is "<caller's id>/<v4 uuid>.jpg". Nothing else (sub-folders, "..", other users' folders,
-- other extensions) matches.
create or replace function public.is_own_avatar_object(object_name text)
returns boolean language sql stable set search_path = public as $$
  select auth.uid() is not null
    and object_name ~ (
      '^' || auth.uid()::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
    );
$$;
revoke execute on function public.is_own_avatar_object(text) from public, anon;
grant execute on function public.is_own_avatar_object(text) to authenticated;

-- Public photos are served through the public URL, which needs no policy. Signed-in users can see (and so list) only
-- their own objects, which the Storage API needs before it lets them delete one.
drop policy if exists "avatars: read own" on storage.objects;
create policy "avatars: read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_own_avatar_object(name));

drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_own_avatar_object(name));

drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_own_avatar_object(name))
  with check (bucket_id = 'avatars' and public.is_own_avatar_object(name));

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_own_avatar_object(name));

-- profiles.avatar_url may only point at the owner's own photo in this bucket (or be empty). A blank value becomes
-- null. Values saved before this migration (from the old "image URL" field) stay as they are until changed; the app
-- does not show them.
create or replace function public.check_avatar_url()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;
  if btrim(coalesce(new.avatar_url, '')) = '' then
    new.avatar_url := null;
    return new;
  end if;
  if new.avatar_url !~ (
    '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/avatars/' || new.id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  ) then
    raise exception 'Upload a profile photo from Settings' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_avatar_url on public.profiles;
create trigger profiles_check_avatar_url before insert or update on public.profiles
for each row execute function public.check_avatar_url();

commit;
