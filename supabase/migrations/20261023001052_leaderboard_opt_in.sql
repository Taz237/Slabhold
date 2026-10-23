-- Collection leaderboard opt-in and the only public read of snapshots.
-- collection_snapshots and card_value_snapshots stay owner-read.
-- This function returns aggregates for eligible, opted-in collections and
-- nothing else: no paid prices, notes, certs, or per-card rows.
--
-- search_path is empty. Every relation and cast in the body is schema-qualified.
-- Idempotent: the column add, replace, and grants can run again.
-- Do not apply from the app. Ship the file and apply it separately.

begin;

set local lock_timeout = '5s';

alter table public.profiles
  add column if not exists leaderboard_opt_in boolean not null default false;

comment on column public.profiles.leaderboard_opt_in is
  'Owner opt-in for the public collection leaderboard. Off until they turn it on.';

create index if not exists profiles_leaderboard_opt_in_idx
  on public.profiles (id)
  where leaderboard_opt_in;

create or replace function public.leaderboard_rows(
  p_today date,
  p_prior date,
  p_min_cards integer,
  p_min_value numeric
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accent text,
  prior_sum numeric,
  today_sum numeric,
  card_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with opted as (
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.accent
    from public.profiles p
    where p.leaderboard_opt_in is true
      and coalesce(p.is_test, false) = false
      and lower(p.username) <> 'qa_vreset_1021'
      and left(lower(p.username), 3) <> 'qa_'
      and left(lower(p.username), 3) <> 'qa-'
      and left(lower(p.username), 5) <> 'test_'
      and left(lower(p.username), 7) <> 'vreset_'
      and exists (
        select 1
        from public.cards c
        where c.user_id = p.id
          and c.is_public is true
      )
  ),
  today_public as (
    select c.user_id, s.median
    from public.cards c
    join public.card_value_snapshots s
      on s.card_id = c.id
     and s.snapshot_date = p_today
    where c.is_public is true
      and s.median is not null
  ),
  valued as (
    select
      user_id,
      count(*)::pg_catalog.int4 as valued_cards,
      sum(median) as valued_sum
    from today_public
    group by user_id
  ),
  overlap as (
    select
      c.user_id,
      sum(today_snap.median) as today_sum,
      sum(prior_snap.median) as prior_sum,
      count(*)::pg_catalog.int4 as card_count
    from public.cards c
    join public.card_value_snapshots today_snap
      on today_snap.card_id = c.id
     and today_snap.snapshot_date = p_today
     and today_snap.median is not null
    join public.card_value_snapshots prior_snap
      on prior_snap.card_id = c.id
     and prior_snap.snapshot_date = p_prior
     and prior_snap.median is not null
    where c.is_public is true
    group by c.user_id
  )
  select
    o.id,
    o.username,
    o.display_name,
    o.avatar_url,
    o.accent,
    overlap.prior_sum,
    overlap.today_sum,
    overlap.card_count
  from opted o
  join valued v on v.user_id = o.id
  join overlap on overlap.user_id = o.id
  where v.valued_cards >= greatest(coalesce(p_min_cards, 5), 5)
    and v.valued_sum >= greatest(coalesce(p_min_value, 100), 100)
    and overlap.prior_sum > 0
    and overlap.card_count > 0;
$$;

comment on function public.leaderboard_rows(date, date, integer, numeric) is
  'Eligible opted-in leaderboard aggregates. Snapshots stay owner-read. Minimums cannot drop below 5 public valued cards and $100.';

revoke all on function public.leaderboard_rows(date, date, integer, numeric) from public;
grant execute on function public.leaderboard_rows(date, date, integer, numeric) to anon, authenticated, service_role;

commit;
