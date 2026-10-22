-- Auto-follow the official updates account when a profile row is created.
-- The id is a profile uuid, not a handle. Signup with email confirmation
-- inserts the profile in handle_new_user before the browser has a session,
-- so the app cannot write this follow under RLS until later. Doing it here
-- runs once, at insert, and does not run again after an unfollow.
--
-- No follow notification is written.
-- A missing updates profile, a constraint failure, or any other error is
-- swallowed so account creation still commits.
--
-- SECURITY REVIEW: this is a trigger on public.profiles, not an RPC.
-- private is not an exposed API schema. The function is not security definer.
-- It inserts one follows row (new profile -> the uuid below) and nothing else.

create or replace function private.follow_official_updates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  updates_id uuid := '6d31ab97-9162-4296-876d-9e0378872fce';
begin
  if new.id = updates_id then
    return new;
  end if;

  begin
    insert into public.follows (follower_id, following_id)
    select new.id, updates_id
    where exists (
      select 1 from public.profiles where id = updates_id
    )
    on conflict (follower_id, following_id) do nothing;
  exception
    when others then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists profiles_follow_official_updates on public.profiles;
create trigger profiles_follow_official_updates
  after insert on public.profiles
  for each row
  execute function private.follow_official_updates();

revoke all on function private.follow_official_updates() from public, anon, authenticated;
