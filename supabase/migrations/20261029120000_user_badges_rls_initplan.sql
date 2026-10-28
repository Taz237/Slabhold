-- UNAPPLIED. Needs review before running.
--
-- Faster RLS on public.user_badges.
--
-- Recreates the two policies from 20261028200000_achievements_badges.sql with
-- (select auth.uid()) in place of auth.uid(), so Postgres evaluates the user id
-- once per statement instead of once per row. The logic is unchanged.

begin;

set local lock_timeout = '5s';

drop policy if exists "Read shown badges" on public.user_badges;
create policy "Read shown badges"
  on public.user_badges
  for select
  to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.profiles
      where public.profiles.id = public.user_badges.user_id
        and public.profiles.show_badges
    )
  );

drop policy if exists "Owners mark badges seen" on public.user_badges;
create policy "Owners mark badges seen"
  on public.user_badges
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
