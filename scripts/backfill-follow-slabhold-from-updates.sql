-- ONE-TIME BACKFILL. Not a migration. Needs review before running.
-- Do not put this file in supabase/migrations and do not run it from
-- supabase db push.
--
-- Every profile that follows @slabholdupdates also follows @slabhold.
-- - Only adds follows. Old @slabholdupdates follows are not deleted.
-- - Anyone who already follows @slabhold is skipped (not exists + on conflict).
-- - @slabhold itself is skipped (no self-follow).
-- - A profile with a block in either direction with @slabhold is skipped.
-- - Does nothing if the @slabhold profile is missing.
-- - No follow notifications are written.
-- Safe to re-run: a second run inserts 0 rows.
--
-- Ids, never handles:
--   slabhold_id = @slabhold        (SIGNUP_AUTO_FOLLOW_USER_ID)
--   updates_id  = @slabholdupdates (OFFICIAL_UPDATES_USER_ID)

with params as (
  select
    '744fedf0-f012-4c9d-841f-18531fdde340'::uuid as slabhold_id,
    '6d31ab97-9162-4296-876d-9e0378872fce'::uuid as updates_id
),
inserted as (
  insert into public.follows (follower_id, following_id)
  select follows.follower_id, params.slabhold_id
  from public.follows
  cross join params
  where follows.following_id = params.updates_id
    and follows.follower_id <> params.slabhold_id
    and exists (
      select 1 from public.profiles where profiles.id = params.slabhold_id
    )
    and not exists (
      select 1
      from public.follows already
      where already.follower_id = follows.follower_id
        and already.following_id = params.slabhold_id
    )
    and not exists (
      select 1
      from public.blocks
      where (blocks.blocker_id = follows.follower_id and blocks.blocked_id = params.slabhold_id)
         or (blocks.blocker_id = params.slabhold_id and blocks.blocked_id = follows.follower_id)
    )
  on conflict (follower_id, following_id) do nothing
  returning 1
)
select
  (select count(*) from inserted) as inserted_follows,
  (
    select count(*) from public.follows cross join params
    where follows.following_id = params.updates_id
  ) as follows_to_updates,
  (
    select count(*) from public.profiles cross join params
    where profiles.id = params.slabhold_id
  ) as slabhold_account_present;
