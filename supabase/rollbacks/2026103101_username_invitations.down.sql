-- Rollback for supabase/migrations/2026103101_username_invitations.sql. Run by hand in the SQL Editor only if that
-- migration must be undone. Safe to re-run.
--
-- It removes the invitation functions, lets any member rename a group again, and restores list_members() and
-- invite_member() exactly as before (which means members' email addresses are shown to each other again and the owner
-- can add an account by email). It deletes no data: invitations, person ids, account links and memberships created by
-- accepted invitations all stay, so re-applying the migration picks up where it left off. Clients still cannot write
-- group_people.user_id.

begin;

drop function if exists public.invite_by_username(uuid, uuid, text);
drop function if exists public.accept_invitation(uuid);
drop function if exists public.decline_invitation(uuid);
drop function if exists public.revoke_invitation(uuid);
drop function if exists public.list_my_invitations();
drop function if exists public.list_group_invitations(uuid);
drop function if exists public.expire_invitations(uuid, uuid, uuid);
drop function if exists public.list_group_members(uuid);

drop trigger if exists group_people_guard_linked on public.group_people;
drop function if exists public.guard_linked_person_removal();

drop policy if exists "groups update as owner" on public.groups;
drop policy if exists "groups update as member" on public.groups;
create policy "groups update as member" on public.groups for update to authenticated
  using (public.is_group_member(id)) with check (public.is_group_member(id));

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

revoke execute on function public.list_members(uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;
revoke execute on function public.invite_member(uuid, text) from public, anon;
grant execute on function public.invite_member(uuid, text) to authenticated;

commit;
