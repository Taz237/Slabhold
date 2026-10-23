-- Collection leaderboard opt-in and the only public read of card snapshots.
-- The function returns card rows for eligible, opted-in public collections:
-- medians and sale counts the value board needs, a bracket id, and flags.
-- The bracket is the week-start sum of public held cards. Private holdings stay out.
-- The lineup is the week-start public snapshot. Deleted or sold cards stay in it.
-- A card made private mid-week still counts, at its last public trusted value.
-- A snapshot taken while the card was private never reaches the percent.
-- Identity is player, year, year label, set, parallel, grade, grader, card number,
-- serial, auto, relic, qualifier, and condition. Any change contributes 0.
-- It does not return collection dollar totals, paid prices, notes, or certs.
--
-- Account age uses auth.users.created_at. profiles.created_at is not the gate.
-- Anon can still read leaderboard_opt_in: profiles SELECT is public, and hiding
-- one column would break select * on profiles.
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

-- Signed-in users can update profiles.created_at. Keep the original timestamp
-- unless the write is the service role.
create or replace function public.protect_profile_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_created_at on public.profiles;
create trigger protect_profile_created_at
  before update on public.profiles
  for each row execute function public.protect_profile_created_at();

revoke all on function public.protect_profile_created_at() from public, anon, authenticated;

alter table public.card_value_snapshots
  add column if not exists n_sales integer;

alter table public.card_value_snapshots
  add column if not exists self_reported boolean not null default false;

alter table public.card_value_snapshots
  add column if not exists id uuid default gen_random_uuid();

alter table public.card_value_snapshots
  add column if not exists card_key uuid;

alter table public.card_value_snapshots
  add column if not exists user_id uuid;

alter table public.card_value_snapshots
  add column if not exists status text;

alter table public.card_value_snapshots
  add column if not exists is_public boolean;

alter table public.card_value_snapshots
  add column if not exists held boolean;

alter table public.card_value_snapshots
  add column if not exists player text;

alter table public.card_value_snapshots
  add column if not exists year text;

alter table public.card_value_snapshots
  add column if not exists set_name text;

alter table public.card_value_snapshots
  add column if not exists parallel text;

alter table public.card_value_snapshots
  add column if not exists grade text;

alter table public.card_value_snapshots
  add column if not exists grader text;

alter table public.card_value_snapshots
  add column if not exists year_label text;

alter table public.card_value_snapshots
  add column if not exists card_number text;

alter table public.card_value_snapshots
  add column if not exists serial_run text;

alter table public.card_value_snapshots
  add column if not exists is_auto boolean;

alter table public.card_value_snapshots
  add column if not exists is_relic boolean;

alter table public.card_value_snapshots
  add column if not exists grade_qualifier text;

alter table public.card_value_snapshots
  add column if not exists condition_type text;

comment on column public.card_value_snapshots.n_sales is
  'Matched sales behind the median. Null is not a trusted price.';

comment on column public.card_value_snapshots.self_reported is
  'True when a matched sale source was self, owner, or reported.';

comment on column public.card_value_snapshots.card_key is
  'Card id copied at snapshot time. Kept after the card row is deleted.';

comment on column public.card_value_snapshots.held is
  'True when the card was unsold at snapshot time.';

update public.card_value_snapshots
set card_key = card_id
where card_key is null
  and card_id is not null;

update public.card_value_snapshots as snaps
set user_id = cards.user_id
from public.cards as cards
where snaps.user_id is null
  and snaps.card_id = cards.id;

do $$
begin
  if not exists (select 1 from public.card_value_snapshots where card_key is null) then
    alter table public.card_value_snapshots alter column card_key set not null;
  end if;
end $$;

create unique index if not exists card_value_snapshots_card_key_date_idx
  on public.card_value_snapshots (card_key, snapshot_date);

create index if not exists card_value_snapshots_user_date_idx
  on public.card_value_snapshots (user_id, snapshot_date);

-- Keep the pre-PR writer (upsert on conflict (card_id, snapshot_date), no card_key)
-- working between "migration applied" and "new app deployed".
create unique index if not exists card_value_snapshots_card_id_date_idx
  on public.card_value_snapshots (card_id, snapshot_date);

create index if not exists card_value_snapshots_date_idx
  on public.card_value_snapshots (snapshot_date);

create or replace function public.card_value_snapshot_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.card_key := coalesce(new.card_key, new.card_id);
  if new.user_id is null and new.card_id is not null then
    select c.user_id into new.user_id from public.cards c where c.id = new.card_id;
  end if;
  return new;
end;
$$;

drop trigger if exists card_value_snapshot_defaults on public.card_value_snapshots;
create trigger card_value_snapshot_defaults
  before insert on public.card_value_snapshots
  for each row execute function public.card_value_snapshot_defaults();

revoke all on function public.card_value_snapshot_defaults() from public, anon, authenticated;

do $$
declare
  user_fk text;
begin
  select pg_get_constraintdef(con.oid)
    into user_fk
  from pg_constraint con
  where con.conname = 'card_value_snapshots_user_id_fkey'
    and con.conrelid = 'public.card_value_snapshots'::regclass;

  if user_fk is null then
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  elsif user_fk not ilike '%delete cascade%' then
    alter table public.card_value_snapshots drop constraint card_value_snapshots_user_id_fkey;
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- The old primary key includes card_id, so the card cannot be set null until
-- that key is replaced. Match the full definition. "card_id" contains "id".
do $$
declare
  pk_def text;
  fk_def text;
begin
  select pg_get_constraintdef(con.oid)
    into pk_def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'card_value_snapshots'
    and con.contype = 'p';

  if replace(coalesce(pk_def, ''), ' ', '') = 'PRIMARYKEY(card_id,snapshot_date)' then
    alter table public.card_value_snapshots drop constraint card_value_snapshots_pkey;
    alter table public.card_value_snapshots alter column id set not null;
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_pkey primary key (id);
  end if;

  alter table public.card_value_snapshots alter column card_id drop not null;

  select pg_get_constraintdef(con.oid)
    into fk_def
  from pg_constraint con
  where con.conname = 'card_value_snapshots_card_id_fkey'
    and con.conrelid = 'public.card_value_snapshots'::regclass;

  if fk_def is null then
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_card_id_fkey
      foreign key (card_id) references public.cards (id) on delete set null;
  elsif fk_def ilike '%delete cascade%' then
    alter table public.card_value_snapshots drop constraint card_value_snapshots_card_id_fkey;
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_card_id_fkey
      foreign key (card_id) references public.cards (id) on delete set null;
  end if;
end $$;

alter table public.card_value_snapshots enable row level security;

drop policy if exists "Users read own card value snapshots" on public.card_value_snapshots;
create policy "Users read own card value snapshots"
  on public.card_value_snapshots
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.cards
      where cards.id = card_value_snapshots.card_id
        and cards.user_id = auth.uid()
    )
  );

revoke all on public.card_value_snapshots from anon, authenticated;
grant select on public.card_value_snapshots to authenticated;
grant select, insert, update, delete on public.card_value_snapshots to service_role;

create index if not exists comp_flags_card_id_idx
  on public.comp_flags (card_id);

drop function if exists public.card_snapshot_identity(text, text, text, text, text, text);

create or replace function public.card_snapshot_identity(
  p_player text,
  p_year text,
  p_year_label text,
  p_set text,
  p_parallel text,
  p_grade text,
  p_grader text,
  p_card_number text,
  p_serial_run text,
  p_is_auto boolean,
  p_is_relic boolean,
  p_grade_qualifier text,
  p_condition_type text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_player, '')) || '|' ||
         lower(coalesce(p_year, '')) || '|' ||
         lower(coalesce(p_year_label, '')) || '|' ||
         lower(coalesce(p_set, '')) || '|' ||
         lower(coalesce(p_parallel, '')) || '|' ||
         lower(coalesce(p_grade, '')) || '|' ||
         lower(coalesce(p_grader, '')) || '|' ||
         lower(regexp_replace(btrim(coalesce(p_card_number, '')), '^#', '')) || '|' ||
         lower(coalesce(p_serial_run, '')) || '|' ||
         case when coalesce(p_is_auto, false) then '1' else '0' end || '|' ||
         case when coalesce(p_is_relic, false) then '1' else '0' end || '|' ||
         lower(coalesce(p_grade_qualifier, '')) || '|' ||
         lower(coalesce(p_condition_type, ''));
$$;

revoke all on function public.card_snapshot_identity(text, text, text, text, text, text, text, text, text, boolean, boolean, text, text) from public, anon, authenticated;

drop function if exists public.leaderboard_rows(date, date, integer, numeric);
drop function if exists public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz);

create function public.leaderboard_rows(
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
  open_flag boolean,
  identity_key text
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
    join auth.users u on u.id = p.id
    left join lateral (
      select sum(s.median) as value
      from public.card_value_snapshots s
      where s.user_id = p.id
        and s.snapshot_date = p_start
        and s.is_public is true
        and s.held is true
    ) pv on true
    where p.leaderboard_opt_in is true
      and p_start is not null
      and p_end is not null
      and p_end >= p_start
      and coalesce(p.is_test, false) = false
      and u.created_at <= least(coalesce(p_as_of, now()), now()) - (least(greatest(coalesce(p_min_account_days, 7), 7), 1000000) * interval '1 day')
      and lower(p.username) <> 'qa_vreset_1021'
      and left(lower(p.username), 3) <> 'qa_'
      and left(lower(p.username), 3) <> 'qa-'
      and left(lower(p.username), 5) <> 'test_'
      and left(lower(p.username), 7) <> 'vreset_'
  ),
  lineup as (
    select
      s.user_id,
      s.card_id,
      s.card_key,
      s.median,
      s.n_sales,
      s.self_reported,
      s.player,
      public.card_snapshot_identity(
        s.player, s.year, s.year_label, s.set_name, s.parallel, s.grade, s.grader,
        s.card_number, s.serial_run, s.is_auto, s.is_relic, s.grade_qualifier, s.condition_type
      ) as identity_key
    from public.card_value_snapshots s
    where s.snapshot_date = p_start
      and s.card_key is not null
      and s.is_public is true
      and s.held is true
      and s.status in ('ok', 'sample')
      and s.median is not null
      and s.median >= 5
      and s.n_sales >= 2
  ),
  valued as (
    select
      user_id,
      count(*)::integer as valued_cards,
      sum(median) as valued_sum
    from lineup
    group by user_id
  ),
  eligible as (
    select o.*
    from opted o
    join valued v on v.user_id = o.id
    where v.valued_cards >= least(greatest(coalesce(p_min_cards, 10), 10), 1000000)
      and v.valued_sum >= least(greatest(coalesce(p_min_value, 250), 250), 1000000)
  ),
  chosen_end as (
    select distinct on (s.card_key)
      s.card_key,
      s.user_id,
      s.median,
      s.n_sales,
      s.self_reported,
      s.player,
      public.card_snapshot_identity(
        s.player, s.year, s.year_label, s.set_name, s.parallel, s.grade, s.grader,
        s.card_number, s.serial_run, s.is_auto, s.is_relic, s.grade_qualifier, s.condition_type
      ) as identity_key
    from public.card_value_snapshots s
    where s.snapshot_date >= p_start
      and s.snapshot_date <= p_end
      and s.is_public is true
      and s.status in ('ok', 'sample')
      and s.median is not null
      and s.median >= 5
      and s.n_sales >= 2
    order by s.card_key, s.snapshot_date desc
  )
  select
    e.id,
    e.username,
    e.display_name,
    e.avatar_url,
    e.accent,
    e.bracket,
    start_snap.card_key,
    start_snap.median,
    case
      when start_snap.player is not null
       and end_snap.player is not null
       and start_snap.identity_key is distinct from end_snap.identity_key
      then start_snap.median
      else coalesce(end_snap.median, 0)
    end,
    start_snap.n_sales,
    case
      when start_snap.player is not null
       and end_snap.player is not null
       and start_snap.identity_key is distinct from end_snap.identity_key
      then start_snap.n_sales
      else coalesce(end_snap.n_sales, 0)
    end,
    case
      when start_snap.player is not null
       and end_snap.player is not null
       and start_snap.identity_key is distinct from end_snap.identity_key
      then coalesce(start_snap.self_reported, false)
      else (coalesce(start_snap.self_reported, false) or coalesce(end_snap.self_reported, false))
    end,
    exists (
      select 1
      from public.comp_flags f
      where f.card_id = start_snap.card_id
        and f.user_id is distinct from e.id
        and f.created_at < (p_start + interval '1 day')
    ),
    start_snap.identity_key
  from eligible e
  join lineup start_snap on start_snap.user_id = e.id
  left join chosen_end end_snap
    on end_snap.card_key = start_snap.card_key
   and end_snap.user_id = e.id;
$$;

comment on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) is
  'Eligible opted-in value-board card rows. Bracket comes from the week-start value of public held cards only. Minimums cannot drop below 10 trusted cards, $250, or 7 days.';

revoke all on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) to service_role;

-- Block ids for the value board, both directions, for one verified viewer.
-- Service role only: load.ts passes the viewer id from auth.getUser().
-- Signed-in users must not be able to list who blocked them.
drop function if exists public.blocked_by_ids();

create or replace function public.leaderboard_hidden_ids(p_viewer uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id from public.blocks b where b.blocker_id = p_viewer
  union
  select b.blocker_id from public.blocks b where b.blocked_id = p_viewer;
$$;

revoke all on function public.leaderboard_hidden_ids(uuid) from public, anon, authenticated;
grant execute on function public.leaderboard_hidden_ids(uuid) to service_role;

commit;
