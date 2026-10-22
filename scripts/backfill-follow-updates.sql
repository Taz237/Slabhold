-- ONE-TIME BACKFILL. Not a migration. Do not put this file in
-- supabase/migrations and do not run it from supabase db push.
-- It does not insert follow notifications.
--
-- PARAMETER: official_updates_user_id
-- Default: 6d31ab97-9162-4296-876d-9e0378872fce
-- The env uuid (OFFICIAL_UPDATES_USER_ID) and this SQL uuid must stay in sync.
-- Change only the uuid in the params query if the updates account changes.
-- Do not substitute a handle.
-- profiles.is_test comes from 20261022181000_profile_interests.sql
-- (the bootstrap schema.sql does not declare it). It is not null.
-- Skip a profile when public.blocks has a row in either direction
-- (blocker_id / blocked_id).

with params as (
  select '6d31ab97-9162-4296-876d-9e0378872fce'::uuid as official_updates_user_id
),
inserted as (
  insert into public.follows (follower_id, following_id)
  select profiles.id, params.official_updates_user_id
  from public.profiles
  cross join params
  where profiles.id <> params.official_updates_user_id
    and not profiles.is_test
    and exists (
      select 1
      from public.profiles updates
      where updates.id = params.official_updates_user_id
    )
    and not exists (
      select 1
      from public.blocks
      where (blocks.blocker_id = profiles.id and blocks.blocked_id = params.official_updates_user_id)
         or (blocks.blocker_id = params.official_updates_user_id and blocks.blocked_id = profiles.id)
    )
  on conflict (follower_id, following_id) do nothing
  returning 1
)
select
  (select official_updates_user_id from params) as official_updates_user_id,
  (select count(*) from inserted) as inserted_follows,
  (select count(*) from public.profiles) as profiles,
  (
    select count(*)
    from public.follows
    cross join params
    where follows.following_id = params.official_updates_user_id
  ) + (select count(*) from inserted) as follows_to_updates,
  (
    select count(*)
    from public.profiles
    cross join params
    where profiles.id = params.official_updates_user_id
  ) as updates_account_present;
