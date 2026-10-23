-- Collection leaderboard opt-in and the only public read of card snapshots.
-- The function returns card rows for eligible, opted-in public collections:
-- medians and sale counts the value board needs, a bracket id, and flags.
-- The bracket is the week-start sum of public held cards. Private holdings stay out.
-- It does not return collection dollar totals, paid prices, notes, or certs.
--
-- search_path is empty. Every relation in the body is schema-qualified.
-- Idempotent: column adds, replace, and grants can run again.
-- Do not apply from the app. Ship the file and apply it separately.

begin;

set local lock_timeout = '5s';

alter table public.profiles
  add column if not exists leaderboard_opt_in boolean not null default false;

comment on column public.profiles.leaderboard_opt_in is
  'Owner opt-in for the public collection leaderboard. Off until they turn it on. Turning it off removes them.';

create index if not exists profiles_leaderboard_opt_in_idx
  on public.profiles (id)
  where leaderboard_opt_in;

alter table public.card_value_snapshots
  add column if not exists n_sales integer;

alter table public.card_value_snapshots
  add column if not exists self_reported boolean not null default false;

comment on column public.card_value_snapshots.n_sales is
  'Matched sales behind the median. Null is not a trusted price.';

comment on column public.card_value_snapshots.self_reported is
  'True when a matched sale source was self, owner, or reported.';

drop function if exists public.leaderboard_rows(date, date, integer, numeric);

create or replace function public.leaderboard_rows(
  p_start date,
  p_end date,
  p_min_cards integer,
  p_min_value numeric,
  p_min_account_days integer,
  p_as_of timestamptz
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accent text,
  bracket text,
  card_id uuid,
  start_median numeric,
  end_median numeric,
  start_n_sales integer,
  end_n_sales integer,
  self_reported boolean,
  open_flag boolean
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
      p.accent,
      case
        when pv.value is null then null
        when pv.value < 1000 then 'under-1k'
        when pv.value < 10000 then '1k-10k'
        else '10k-plus'
      end as bracket
    from public.profiles p
    left join lateral (
      select sum(s.median) as value
      from public.cards c
      join public.card_value_snapshots s
        on s.card_id = c.id
       and s.snapshot_date = p_start
      where c.user_id = p.id
        and c.is_public is true
        and (c.sell_price is null or c.sell_date is null)
    ) pv on true
    where p.leaderboard_opt_in is true
      and coalesce(p.is_test, false) = false
      and p.created_at <= least(coalesce(p_as_of, now()), now()) - (greatest(coalesce(p_min_account_days, 7), 7) * interval '1 day')
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
  trusted as (
    select c.user_id, s.median
    from public.cards c
    join public.card_value_snapshots s
      on s.card_id = c.id
     and s.snapshot_date = p_end
    where c.is_public is true
      and (c.sell_price is null or c.sell_date is null)
      and s.median is not null
      and s.median >= 5
      and s.n_sales >= 2
  ),
  valued as (
    select
      user_id,
      count(*)::integer as valued_cards,
      sum(median) as valued_sum
    from trusted
    group by user_id
  ),
  eligible as (
    select o.*
    from opted o
    join valued v on v.user_id = o.id
    where v.valued_cards >= greatest(coalesce(p_min_cards, 10), 10)
      and v.valued_sum >= greatest(coalesce(p_min_value, 250), 250)
  )
  select
    e.id,
    e.username,
    e.display_name,
    e.avatar_url,
    e.accent,
    e.bracket,
    c.id,
    start_snap.median,
    end_snap.median,
    start_snap.n_sales,
    end_snap.n_sales,
    (coalesce(start_snap.self_reported, false) or coalesce(end_snap.self_reported, false)),
    exists (
      select 1
      from public.comp_flags f
      where f.card_id = c.id
    )
  from eligible e
  join public.cards c
    on c.user_id = e.id
   and c.is_public is true
   and (c.sell_price is null or c.sell_date is null)
  join public.card_value_snapshots start_snap
    on start_snap.card_id = c.id
   and start_snap.snapshot_date = p_start
  join public.card_value_snapshots end_snap
    on end_snap.card_id = c.id
   and end_snap.snapshot_date = p_end;
$$;

comment on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) is
  'Eligible opted-in value-board card rows. Bracket comes from the week-start value of public held cards only. Minimums cannot drop below 10 trusted cards, $250, or 7 days.';

revoke all on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) to service_role;

-- People who blocked the signed-in user. The other direction is hidden_author_ids.
create or replace function public.blocked_by_ids()
returns table (blocker_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocker_id
  from public.blocks b
  where b.blocked_id = auth.uid();
$$;

comment on function public.blocked_by_ids() is
  'Accounts that blocked the signed-in user. Granted to authenticated only.';

revoke all on function public.blocked_by_ids() from public, anon, authenticated, service_role;
grant execute on function public.blocked_by_ids() to authenticated;

commit;
