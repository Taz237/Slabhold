-- Skip auto-follow for test and QA profiles.
-- Replaces private.follow_official_updates from
-- 20261022210000_follow_official_updates.sql. That applied file is unchanged.
-- Does not remove or change existing public.follows rows.
--
-- Still an after-insert trigger only, so an unfollow is never reversed.
-- No follow notification is written.
-- A missing updates profile is skipped silently (the insert matches no row),
-- with no warning. A constraint failure or any other error raises a warning
-- and does not abort account creation.
--
-- Skip when new.is_test is true, or when lower(new.username) matches
-- '^(qa_|qa-|test_|vreset_)' (for example qa_guard_1022).
--
-- The env uuid (OFFICIAL_UPDATES_USER_ID) and this SQL uuid must stay in sync.
-- See lib/social/official-updates.ts.
--
-- SECURITY REVIEW: this is a trigger on public.profiles, not an RPC.
-- private is not an exposed API schema. The function is not security definer.
-- search_path is empty; every relation in the body is schema-qualified.
-- It inserts one follows row (new profile -> the uuid below) and nothing else.

begin;

set local lock_timeout = '5s';

create or replace function private.follow_official_updates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  updates_id pg_catalog.uuid := '6d31ab97-9162-4296-876d-9e0378872fce';
begin
  if new.id = updates_id then
    return new;
  end if;

  if new.is_test is true
     or lower(new.username) ~ '^(qa_|qa-|test_|vreset_)' then
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
      raise warning 'follow_official_updates: auto-follow skipped for profile %: % (%)', new.id, sqlerrm, sqlstate;
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

commit;
