-- UNAPPLIED. Needs review before running.
--
-- Hide profiles.pinned_badges from other users when show_badges is off.
--
-- RLS filters rows, not columns, so the "Profiles are public" select policy
-- lets anyone read pinned_badges straight from the API, even with
-- show_badges = false. user_badges is already hidden by its policy; the pins
-- were the one leak.
--
-- 1) public.profile_badge_pins: one row per profile. Pins are returned when
--    show_badges is on, or to the owner; anyone else gets '{}'. Same pattern
--    as public.public_cards: security_invoker = false, so it reads the column
--    as the view owner.
-- 2) anon and authenticated lose SELECT on profiles.pinned_badges. They keep
--    SELECT on every other profiles column, granted column by column.
--    UPDATE is unchanged, so owners still save pins (the pin trigger still
--    checks them).
--
-- After this runs:
-- - Clients read pins from public.profile_badge_pins, not profiles. The app
--   already does, and falls back to the column only while this view is missing.
-- - `select *` on profiles as anon or authenticated fails with permission
--   denied. The app never selects "*" on profiles.
-- - A column added to profiles later is not readable by clients until it is
--   granted: `grant select (new_column) on public.profiles to anon, authenticated;`
-- - service_role (server admin client) is unaffected.

begin;

set local lock_timeout = '5s';

create or replace view public.profile_badge_pins
with (security_invoker = false) as
select
  id,
  case
    when show_badges or id = (select auth.uid()) then pinned_badges
    else '{}'::text[]
  end as pinned_badges
from public.profiles;

comment on view public.profile_badge_pins is
  'Pinned badges as the viewer may see them: empty unless show_badges is on or the viewer is the owner.';

revoke all on public.profile_badge_pins from public, anon, authenticated;
grant select on public.profile_badge_pins to anon, authenticated;

revoke select on public.profiles from anon, authenticated;

do $$
declare
  readable text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into readable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name <> 'pinned_badges';

  execute format('grant select (%s) on public.profiles to anon, authenticated', readable);
end
$$;

commit;
