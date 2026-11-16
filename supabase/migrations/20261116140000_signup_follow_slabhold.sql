-- UNAPPLIED. Needs review before running.
--
-- New signups auto-follow the main @slabhold account instead of
-- @slabholdupdates. Matched by profile id, never by handle.
--
-- Adds private.follow_slabhold_on_signup and its after-insert trigger on
-- public.profiles, and drops the old profiles_follow_official_updates trigger
-- so a new account follows only @slabhold. The old function
-- private.follow_official_updates is left in place (no longer called) so the
-- applied migrations 20261022210000 and 20261022240000 stay unchanged.
--
-- Existing follows are not touched: nobody is unfollowed from
-- @slabholdupdates. To also follow @slabhold for current @slabholdupdates
-- followers, see scripts/backfill-follow-slabhold-from-updates.sql (one-time).
--
-- Same rules as before:
-- - after insert only, so an unfollow is never reversed;
-- - no follow notification is written;
-- - test and QA profiles are skipped (new.is_test, or a handle starting with
--   qa_, qa-, test_ or vreset_);
-- - a missing @slabhold profile is skipped silently; any other error raises a
--   warning and does not abort account creation.
--
-- slabhold_id must stay in sync with SIGNUP_AUTO_FOLLOW_USER_ID in
-- lib/social/signup-auto-follow.ts (BRAND_ACCOUNT_IDS in
-- lib/leaderboard/brand-accounts.ts).
--
-- SECURITY REVIEW: trigger on public.profiles, not an RPC. private is not an
-- exposed API schema. Not security definer. search_path is empty; every
-- relation is schema-qualified. Inserts one follows row and nothing else.

begin;

set local lock_timeout = '5s';

create or replace function private.follow_slabhold_on_signup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  slabhold_id pg_catalog.uuid := '744fedf0-f012-4c9d-841f-18531fdde340';
begin
  if new.id = slabhold_id then
    return new;
  end if;

  if new.is_test is true
     or lower(new.username) ~ '^(qa_|qa-|test_|vreset_)' then
    return new;
  end if;

  begin
    insert into public.follows (follower_id, following_id)
    select new.id, slabhold_id
    where exists (
      select 1 from public.profiles where id = slabhold_id
    )
    on conflict (follower_id, following_id) do nothing;
  exception
    when others then
      raise warning 'follow_slabhold_on_signup: auto-follow skipped for profile %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

revoke all on function private.follow_slabhold_on_signup() from public, anon, authenticated;

drop trigger if exists profiles_follow_official_updates on public.profiles;

drop trigger if exists profiles_follow_slabhold on public.profiles;
create trigger profiles_follow_slabhold
  after insert on public.profiles
  for each row
  execute function private.follow_slabhold_on_signup();

commit;
