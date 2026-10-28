-- UNAPPLIED. Needs review before running.
--
-- Achievements and badges.
--
-- public.user_badges holds earned badges, one row per (user, category, tier).
-- Earned badges are permanent: there is no delete grant, and deleting cards
-- later does not remove a row. Awarding happens server-side with the service
-- role. Clients cannot insert rows or change category, tier, or earned_at.
-- The owner can update only seen_at (column grant), to mark the earn reveal
-- as shown.
--
-- Read access: anyone can read a user's badges only while that user's
-- profiles.show_badges is true. The owner can always read their own.
--
-- profiles.show_badges defaults to true, so everyone starts with badges on.
-- profiles.pinned_badges holds up to 3 "category:tier" strings. Empty means
-- the app auto-pins the 3 highest tiers. The owner writes both columns through
-- the existing row-wide "Users update own profile" policy.
-- profiles_enforce_pinned_badges rejects a pin the user has not earned and a
-- repeated pin, so a profile cannot show a badge it does not hold.
--
-- public.leaderboard_podiums records the top 3 on each weekly board once the
-- week closes (Tuesday 00:00 ET). The Leaderboard badge counts distinct weeks
-- here. Service role only; clients have no access.

begin;

set local lock_timeout = '5s';

create schema if not exists private;

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  tier text not null,
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint user_badges_category check (
    category in (
      'collector',
      'streak',
      'rainbow-chaser',
      'slab-king',
      'voice-of-the-hobby',
      'following',
      'leaderboard',
      'limited'
    )
  ),
  constraint user_badges_tier check (
    tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary')
  ),
  constraint user_badges_user_category_tier_key unique (user_id, category, tier)
);

comment on table public.user_badges is
  'Earned badges. Permanent. Inserted server-side only. The owner can update seen_at.';

create index if not exists user_badges_unseen_idx
  on public.user_badges (user_id)
  where seen_at is null;

alter table public.profiles
  add column if not exists show_badges boolean not null default true;

alter table public.profiles
  add column if not exists pinned_badges text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_pinned_badges_max;

alter table public.profiles
  add constraint profiles_pinned_badges_max
  check (cardinality(pinned_badges) <= 3);

comment on column public.profiles.show_badges is
  'Badges show on this profile and to other users. On by default.';
comment on column public.profiles.pinned_badges is
  'Up to 3 earned badges as "category:tier". Empty means auto-pin the 3 highest tiers.';

create or replace function private.enforce_pinned_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.pinned_badges is not distinct from old.pinned_badges then
    return new;
  end if;
  if new.pinned_badges is null or cardinality(new.pinned_badges) = 0 then
    return new;
  end if;
  if cardinality(new.pinned_badges) <> (
    select count(distinct pin.value)
    from unnest(new.pinned_badges) as pin(value)
    where pin.value is not null
  ) then
    raise exception 'can only pin a badge once'
      using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(new.pinned_badges) as pin(value)
    where not exists (
      select 1
      from public.user_badges
      where public.user_badges.user_id = new.id
        and public.user_badges.category || ':' || public.user_badges.tier = pin.value
    )
  ) then
    raise exception 'can only pin a badge you earned'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_pinned_badges() from public, anon, authenticated;

drop trigger if exists profiles_enforce_pinned_badges on public.profiles;
create trigger profiles_enforce_pinned_badges
  before insert or update of pinned_badges on public.profiles
  for each row
  execute function private.enforce_pinned_badges();

alter table public.user_badges enable row level security;

revoke all on public.user_badges from public, anon, authenticated;
grant select on public.user_badges to anon, authenticated;
grant update (seen_at) on public.user_badges to authenticated;

drop policy if exists "Read shown badges" on public.user_badges;
create policy "Read shown badges"
  on public.user_badges
  for select
  to anon, authenticated
  using (
    auth.uid() = user_id
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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.leaderboard_podiums (
  week_start date not null,
  board_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank smallint not null,
  recorded_at timestamptz not null default now(),
  constraint leaderboard_podiums_rank check (rank between 1 and 3),
  primary key (week_start, board_id, user_id)
);

comment on table public.leaderboard_podiums is
  'Top 3 per weekly board, recorded after the week closes. Service role only.';

create index if not exists leaderboard_podiums_user_id_idx
  on public.leaderboard_podiums (user_id);

alter table public.leaderboard_podiums enable row level security;

revoke all on public.leaderboard_podiums from public, anon, authenticated;

commit;
