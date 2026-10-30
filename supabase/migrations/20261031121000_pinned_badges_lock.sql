-- UNAPPLIED. Needs review before running.
--
-- Lock profiles.pinned_badges to public.profile_badge_pins, the view the
-- profile page reads (lib/badges/visible-pins.ts).
--
-- 20261029130000_pinned_badges_privacy.sql (#118) made the view and took
-- SELECT on the column away from anon and authenticated. The column can still
-- be read straight from the API when:
--   - that migration hasn't run;
--   - anything later grants table-wide SELECT on profiles again (a re-run of
--     the Supabase default grants, `grant select on all tables in schema
--     public`, or a dashboard grant). A table-wide grant covers every column,
--     pinned_badges included, and silently undoes the column lock;
--   - SELECT on the column is granted on its own, or through PUBLIC.
-- This migration puts the lock back in one place, and is safe to run whether
-- or not #118's ran, and to run again:
--
-- 1) public.profile_badge_pins is (re)made exactly as in #118: pins are
--    returned when show_badges is on, or to the owner; anyone else gets '{}'.
--    security_invoker = false so it reads the column as the view owner, and
--    security_barrier = true so a viewer's filter functions never see a row
--    before the CASE hides it. Only SELECT is granted on it.
-- 2) Table-wide SELECT on profiles is revoked from public, anon and
--    authenticated, and column SELECT on pinned_badges is revoked from all
--    three as well.
-- 3) SELECT is granted back on every other profiles column, column by column.
--    That includes any column added since #118 ran.
-- 4) A check at the end fails the migration (and rolls it back) if anon or
--    authenticated can still read pinned_badges, or can't read the view.
--
-- Unchanged: UPDATE on profiles (owners still save pins; the
-- profiles_enforce_pinned_badges trigger still checks them), RLS policies,
-- and service_role (the server's admin client reads pins for the owner).
--
-- After this runs, a column added to profiles is not readable by clients
-- until it is granted:
--   grant select (new_column) on public.profiles to anon, authenticated;
-- Never `grant select on public.profiles to ...` without a column list: that
-- reopens pinned_badges. Re-run this migration if it happens.

begin;

set local lock_timeout = '5s';

create or replace view public.profile_badge_pins
with (security_invoker = false, security_barrier = true) as
select
  id,
  case
    when show_badges or id = (select auth.uid()) then pinned_badges
    else '{}'::text[]
  end as pinned_badges
from public.profiles;

comment on view public.profile_badge_pins is
  'Pinned badges as the viewer may see them: empty unless show_badges is on or the viewer is the owner. The only client path to profiles.pinned_badges.';

revoke all on public.profile_badge_pins from public, anon, authenticated;
grant select on public.profile_badge_pins to anon, authenticated;

revoke select on public.profiles from public, anon, authenticated;
revoke select (pinned_badges) on public.profiles from public, anon, authenticated;

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

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(api_role, 'public.profiles', 'pinned_badges', 'select') then
      raise exception '% can still read profiles.pinned_badges', api_role;
    end if;
    if not has_table_privilege(api_role, 'public.profile_badge_pins', 'select') then
      raise exception '% cannot read public.profile_badge_pins', api_role;
    end if;
    if not has_column_privilege(api_role, 'public.profiles', 'username', 'select') then
      raise exception '% lost select on profiles.username', api_role;
    end if;
  end loop;
end
$$;

commit;
