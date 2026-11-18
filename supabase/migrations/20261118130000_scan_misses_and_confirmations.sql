-- UNAPPLIED. Needs review before running.
-- Do not `supabase db push` this, and do not apply it with the Supabase CLI.
--
-- Two small tables for the scanner (docs/scanner-coverage-plan.md). Text only:
-- no photos, no cert numbers, and no user ids in either one.
--
-- The app works without them. Until this is applied, a miss is still written
-- to the server log as one "[scan-miss]" line, and confirmed cards are simply
-- not remembered. Nothing else reads or writes these tables.
--
-- public.scan_misses
--   One row per scan that didn't end on the card: what the phone read, what we
--   searched, why it fell out, and what the collector was shown. Written by
--   POST /api/scan/miss with the service role. Read by the team only.
--
-- public.scan_miss_weekly
--   A view over scan_misses: misses per week by reason, sport, year and set,
--   so the biggest gaps show first.
--
-- public.scan_confirmations
--   The card a collector picked for a read that found none ("Mario Lemieux,
--   front only" -> 1985-86 Topps #9), with a count. The next scan that reads
--   the same sees it first in its choices. It is only ever shown as a choice
--   to tap: it never answers a scan by itself.
--
-- public.confirm_scan_card(...)
--   Adds a confirmation, or raises the count on the row already there.
--   Service role only.
--
-- Undo:
--   drop function if exists public.confirm_scan_card(text, text, text, text, text, text);
--   drop view if exists public.scan_miss_weekly;
--   drop table if exists public.scan_confirmations;
--   drop table if exists public.scan_misses;

create table if not exists public.scan_misses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reason text not null check (reason in ('no_text', 'no_player', 'player_only', 'unpinned', 'open_fields', 'none_of_these')),
  why text not null default '' check (char_length(why) <= 200),
  kind text not null default 'unknown' check (kind in ('card', 'slab', 'unknown')),
  front_lines text[] not null default '{}' check (cardinality(front_lines) <= 40),
  back_lines text[] not null default '{}' check (cardinality(back_lines) <= 40),
  player_name text not null default '' check (char_length(player_name) <= 80),
  sport text not null default '' check (char_length(sport) <= 24),
  year_label text not null default '' check (char_length(year_label) <= 12),
  set_brand text not null default '' check (char_length(set_brand) <= 80),
  card_number text not null default '' check (char_length(card_number) <= 20),
  serial_run int,
  is_auto boolean not null default false,
  is_relic boolean not null default false,
  searched jsonb not null default '{}'::jsonb,
  shown jsonb not null default '{}'::jsonb
);

create index if not exists scan_misses_created_at_idx on public.scan_misses (created_at desc);

alter table public.scan_misses enable row level security;

-- No policies: the Next.js server writes with the service role only.
revoke all on public.scan_misses from anon, authenticated;
grant select, insert, delete on public.scan_misses to service_role;

create or replace view public.scan_miss_weekly
with (security_invoker = true) as
select
  date_trunc('week', created_at)::date as week,
  reason,
  sport,
  year_label,
  set_brand,
  count(*) as misses,
  count(distinct player_name) filter (where player_name <> '') as players
from public.scan_misses
group by 1, 2, 3, 4, 5
order by 1 desc, misses desc;

revoke all on public.scan_miss_weekly from anon, authenticated;
grant select on public.scan_miss_weekly to service_role;

create table if not exists public.scan_confirmations (
  read_key text not null check (char_length(read_key) between 3 and 200),
  player_name text not null check (char_length(player_name) between 1 and 80),
  sport text not null default '' check (char_length(sport) <= 24),
  year_label text not null check (year_label ~ '^\d{4}(-\d{2})?$'),
  set_brand text not null check (char_length(set_brand) between 1 and 80),
  card_number text not null check (char_length(card_number) between 1 and 20),
  confirmations int not null default 1 check (confirmations >= 1),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (read_key, year_label, set_brand, card_number)
);

alter table public.scan_confirmations enable row level security;

-- No policies: the Next.js server reads and writes with the service role only.
revoke all on public.scan_confirmations from anon, authenticated;
grant select, insert, update, delete on public.scan_confirmations to service_role;

create or replace function public.confirm_scan_card(
  p_read_key text,
  p_player_name text,
  p_sport text,
  p_year_label text,
  p_set_brand text,
  p_card_number text
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.scan_confirmations (read_key, player_name, sport, year_label, set_brand, card_number)
  values (p_read_key, p_player_name, coalesce(p_sport, ''), p_year_label, p_set_brand, p_card_number)
  on conflict (read_key, year_label, set_brand, card_number)
  do update set confirmations = public.scan_confirmations.confirmations + 1, last_at = now();
$$;

revoke all on function public.confirm_scan_card(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_scan_card(text, text, text, text, text, text) to service_role;
