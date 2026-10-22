-- ONE-TIME BACKFILL. Not a migration. Do not put this file in
-- supabase/migrations and do not run it from supabase db push.
-- It does not insert follow notifications.
--
-- PARAMETER: official_updates_user_id
-- Default: 6d31ab97-9162-4296-876d-9e0378872fce
-- Change only the uuid in the params query if the updates account changes.
-- Do not substitute a handle.

with params as (
  select '6d31ab97-9162-4296-876d-9e0378872fce'::uuid as official_updates_user_id
),
inserted as (
  insert into public.follows (follower_id, following_id)
  select profiles.id, params.official_updates_user_id
  from public.profiles
  cross join params
  where profiles.id <> params.official_updates_user_id
    and exists (
      select 1
      from public.profiles updates
      where updates.id = params.official_updates_user_id
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
  ) as follows_to_updates,
  (
    select count(*)
    from public.profiles
    cross join params
    where profiles.id = params.official_updates_user_id
  ) as updates_account_present;
