import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogSeedRows } from "../lib/card-catalog";

const esc = (s: string) => s.replace(/'/g, "''");
const seeds = catalogSeedRows()
  .map(
    (r) =>
      `  ('${esc(r.player)}', '${esc(r.year_label)}', '${esc(r.set_name)}', '${esc(r.card_number)}', '${esc(r.parallel)}', '${esc(r.sport)}')`,
  )
  .join(",\n");

const rpc = readFileSync(join("scripts", "search_cards_rpc.sql"), "utf8");

const sql = `-- Typo-tolerant, nickname-aware Add Card search catalog.

create schema if not exists extensions;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.norm(t text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(trim(regexp_replace(
    replace(
      regexp_replace(
        regexp_replace(
          extensions.unaccent(coalesce(t, '')),
          '([a-zA-Z0-9])-([a-zA-Z0-9])',
          E'\\1' || chr(1) || E'\\2',
          'g'
        ),
        '[^a-zA-Z0-9[:space:]' || chr(1) || ']+',
        ' ',
        'g'
      ),
      chr(1),
      '-'
    ),
    '[[:space:]]+',
    ' ',
    'g'
  )));
$$;

create table if not exists public.card_catalog (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  year_label text,
  set_name text,
  card_number text,
  parallel text not null default 'Base',
  sport text,
  search_text text generated always as (
    public.norm(
      coalesce(player, '') || ' ' ||
      coalesce(year_label, '') || ' ' ||
      coalesce(set_name, '') || ' ' ||
      coalesce(card_number, '')
    )
  ) stored
);

create unique index if not exists card_catalog_identity_uidx
  on public.card_catalog (
    player,
    coalesce(year_label, ''),
    coalesce(set_name, ''),
    coalesce(card_number, ''),
    parallel
  );

create index if not exists card_catalog_search_text_trgm
  on public.card_catalog
  using gin (search_text extensions.gin_trgm_ops);

create table if not exists public.player_aliases (
  alias text primary key,
  player text not null
);

alter table public.card_catalog enable row level security;
alter table public.player_aliases enable row level security;

drop policy if exists "card_catalog_select_public" on public.card_catalog;
create policy "card_catalog_select_public"
  on public.card_catalog for select to anon, authenticated using (true);

drop policy if exists "player_aliases_select_public" on public.player_aliases;
create policy "player_aliases_select_public"
  on public.player_aliases for select to anon, authenticated using (true);

grant select on public.card_catalog to anon, authenticated;
grant select on public.player_aliases to anon, authenticated;

insert into public.card_catalog (player, year_label, set_name, card_number, parallel, sport)
values
${seeds}
on conflict do nothing;

insert into public.player_aliases (alias, player) values
  (public.norm('Wemby'), 'Victor Wembanyama'),
  (public.norm('Wemb'), 'Victor Wembanyama'),
  (public.norm('Bron'), 'LeBron James'),
  (public.norm('King James'), 'LeBron James'),
  (public.norm('LBJ'), 'LeBron James'),
  (public.norm('Ant'), 'Anthony Edwards'),
  (public.norm('Ant-Man'), 'Anthony Edwards'),
  (public.norm('SGA'), 'Shai Gilgeous-Alexander'),
  (public.norm('Luka'), 'Luka Dončić'),
  (public.norm('CC'), 'Caitlin Clark'),
  (public.norm('Shohei'), 'Shohei Ohtani'),
  (public.norm('MJ'), 'Michael Jordan'),
  (public.norm('Giannis'), 'Giannis Antetokounmpo'),
  (public.norm('Greek Freak'), 'Giannis Antetokounmpo'),
  (public.norm('Mahomes'), 'Patrick Mahomes'),
  (public.norm('KD'), 'Kevin Durant'),
  (public.norm('Steph'), 'Stephen Curry'),
  (public.norm('Jokic'), 'Nikola Jokic'),
  (public.norm('Joker'), 'Nikola Jokic')
on conflict do nothing;

${rpc}
`;

writeFileSync(
  "supabase/migrations/20261016210000_card_catalog_search.sql",
  sql,
);
console.log("wrote migration", sql.length, "chars,", catalogSeedRows().length, "seeds");
