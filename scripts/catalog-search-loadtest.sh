#!/usr/bin/env bash
# Seed 100k synthetic catalog rows and print EXPLAIN ANALYZE for search_cards.
# Default target is a throwaway local database (created and dropped on each run).
# Pass DATABASE_URL to use another Postgres. This script refuses the production
# Supabase project. It does not read .env.local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROD_REF="knuwflptobyutrauxblj"
if [[ "${DATABASE_URL:-}" == *"${PROD_REF}"* || "${DATABASE_URL:-}" == *supabase.co* ]]; then
  echo "Refusing DATABASE_URL: this load test writes 100k rows and must not run on Supabase." >&2
  exit 1
fi

DB_NAME="slabhold_catalog_loadtest"
LOCAL=0
if [[ -z "${DATABASE_URL:-}" ]]; then
  LOCAL=1
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}' and pid <> pg_backend_pid();" >/dev/null
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${DB_NAME};"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "create database ${DB_NAME};"
  PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME")
else
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)
fi

run_sql() {
  "${PSQL[@]}" "$@"
}

if [[ "$LOCAL" -eq 1 ]]; then
  run_sql <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
SQL

  run_sql -f supabase/migrations/20261016210000_card_catalog_search.sql
  run_sql -f supabase/migrations/20261021120000_card_catalog_search_ranking.sql
  run_sql -f supabase/migrations/20261022120000_catalog_search_prefilter_and_staging.sql

  run_sql <<'SQL'
create table if not exists public.cards (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  player text not null,
  year integer not null,
  "set" text not null,
  parallel text not null default 'Base',
  card_number text not null default '',
  sport text not null default 'Basketball',
  year_label text,
  set_name text,
  serial_run integer,
  is_rookie boolean not null default false
);
SQL
fi

run_sql <<'SQL'
insert into public.card_catalog (player, year_label, set_name, card_number, parallel, sport, source, status)
select
  'Load Player ' || lpad((g % 8000)::text, 4, '0'),
  (1990 + (g % 30))::text,
  (array['Panini Prizm', 'Panini Select', 'Topps Chrome', 'Panini Optic', 'Hoops', 'Topps Update'])[1 + (g % 6)],
  'L' || g::text,
  (array['Base', 'Silver', 'Holo', 'Refractor', 'Green'])[1 + (g % 5)],
  (array['Basketball', 'Baseball', 'Football', 'Hockey'])[1 + (g % 4)],
  'synthetic',
  'verified'
from generate_series(1, 100000) as g
on conflict do nothing;

insert into public.card_catalog (player, year_label, set_name, card_number, parallel, sport, status)
values ('Pending Only Player', '2020', 'Hoops', '9', 'Base', 'Basketball', 'pending')
on conflict do nothing;

analyze public.card_catalog;
SQL

run_sql <<'SQL'
do $$
declare
  n int;
begin
  select count(*) into n from public.search_cards('jaxson dart', 20);
  if n <> 1 then
    raise exception 'jaxson dart returned % rows, expected 1', n;
  end if;
  select count(*) into n from public.search_cards('wemby rookie', 20);
  if n <> 4 then
    raise exception 'wemby rookie returned % rows, expected 4', n;
  end if;
  select count(*) into n from public.search_cards('ohtani refractor', 20);
  if n <> 1 then
    raise exception 'ohtani refractor returned % rows, expected 1', n;
  end if;
  select count(*) into n from public.search_cards('Pending Only Player', 20);
  if n <> 0 then
    raise exception 'pending row was searchable (% rows)', n;
  end if;
  select count(*) into n from public.search_cards('refractor', 20);
  if n <> 0 then
    raise exception 'parallel-only query scanned the catalog (% rows)', n;
  end if;
end $$;
SQL

if [[ "$LOCAL" -eq 1 ]]; then
  run_sql <<'SQL'
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.cards (id, user_id, player, year, "set", set_name, year_label, card_number, parallel, sport, is_rookie)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Zebulon Quill', 2024, 'Custom Set', 'Custom Set', '2024', '44', 'Pink Ice', 'Baseball', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Zebulon Quill', 2024, 'Custom Set', 'Custom Set', '2024', '44', 'Pink Ice', 'Baseball', false);

do $$
declare
  before_cards text;
  after_cards text;
  n int;
  approved int;
  merged int;
begin
  select md5(string_agg(cards::text, '|' order by id)) into before_cards from public.cards;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform public.submit_catalog_card('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  perform public.submit_catalog_card('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  perform public.submit_catalog_card('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  select count(*) into n from public.catalog_staging where submitted_card_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 1 then
    raise exception 'submit was not idempotent (% rows)', n;
  end if;
  select count(*) into n from public.catalog_staging;
  if n <> 1 then
    raise exception 'user 1 submitted another user''s card (% staging rows)', n;
  end if;

  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform public.submit_catalog_card('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  perform public.submit_catalog_card('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  select count(*) into n from public.catalog_staging;
  if n <> 2 then
    raise exception 'expected 2 staging rows, got %', n;
  end if;

  select public.approve_catalog_consensus() into approved;
  if approved <> 2 then
    raise exception 'expected 2 approved rows, got %', approved;
  end if;
  select public.promote_catalog_batch('user') into merged;
  if merged <> 2 then
    raise exception 'expected 2 merged rows, got %', merged;
  end if;
  select count(*) into n
  from public.card_catalog
  where player = 'Zebulon Quill' and status = 'verified';
  if n <> 1 then
    raise exception 'expected 1 promoted catalog row, got %', n;
  end if;
  select public.promote_catalog_batch('user') into merged;
  if merged <> 0 then
    raise exception 'second promote changed % rows', merged;
  end if;
  select count(*) into n from public.search_cards('Zebulon Quill', 20);
  if n <> 1 then
    raise exception 'promoted card was not searchable (% rows)', n;
  end if;

  select md5(string_agg(cards::text, '|' order by id)) into after_cards from public.cards;
  if before_cards is distinct from after_cards then
    raise exception 'cards rows changed';
  end if;
end $$;
SQL
fi

echo "CATALOG_LOADTEST_ROWS $(run_sql -tA -c "select count(*) from public.card_catalog;")"
echo "CATALOG_LOADTEST_SYNTHETIC $(run_sql -tA -c "select count(*) from public.card_catalog where source = 'synthetic';")"

export CATALOG_LOADTEST_LOCAL="$LOCAL"
node --input-type=module <<'JS'
import { spawnSync } from "node:child_process";

const local = process.env.CATALOG_LOADTEST_LOCAL === "1";
const queries = [
  ["jaxson dart", "player"],
  ["wemby rookie", "alias + filler"],
  ["ohtani refractor", "player shorter than parallel word"],
  ["wembanyma", "typo"],
  ["prizm", "set-only"],
  ["2024 332", "year + number"],
];

function psql(sql) {
  const args = local
    ? ["-u", "postgres", "psql", "-d", "slabhold_catalog_loadtest", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql]
    : ["psql", process.env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql];
  const cmd = local ? "sudo" : args.shift();
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  return result.stdout.trim();
}

function summarize(plan) {
  const hits = [];
  const walk = (node) => {
    if (!node) return;
    const name = node["Node Type"] || "";
    if (/Index|Bitmap|Seq Scan/i.test(name)) {
      hits.push(`${name}${node["Index Name"] ? " " + node["Index Name"] : ""}`);
    }
    for (const child of node.Plans || []) walk(child);
  };
  walk(plan.Plan);
  return {
    execMs: Number(plan["Execution Time"]),
    planMs: Number(plan["Planning Time"]),
    rows: plan.Plan?.["Actual Rows"] ?? null,
    scans: [...new Set(hits)],
  };
}

const lines = [];
for (const [query, note] of queries) {
  const escaped = query.replaceAll("'", "''");
  const count = psql(`select count(*) from public.search_cards('${escaped}', 20);`);
  const raw = psql(
    `explain (analyze, buffers, format json) select * from public.search_cards('${escaped}', 20);`,
  );
  const plan = JSON.parse(raw)[0];
  const summary = summarize(plan);
  lines.push({
    query,
    note,
    resultRows: Number(count),
    executionMs: Number(summary.execMs.toFixed(3)),
    planningMs: Number(summary.planMs.toFixed(3)),
    scans: summary.scans,
  });
}

const probes = [
  [
    "ohtani anchor",
    `explain (analyze, buffers, format json)
     select c.id
     from public.card_catalog c
     where c.status = 'verified'
       and (
         'ohtani' operator(extensions.<%) c.player_norm
         or c.player_norm like '%ohtani%'
         or c.search_text like '%ohtani%'
       )
     order by extensions.word_similarity('ohtani', c.player_norm) desc
     limit 300`,
  ],
  [
    "prizm set-only",
    `explain (analyze, buffers, format json)
     select c.id
     from public.card_catalog c
     where c.status = 'verified'
       and c.search_text like '%prizm%'
     limit 300`,
  ],
  [
    "bowman set-only",
    `explain (analyze, buffers, format json)
     select c.id
     from public.card_catalog c
     where c.status = 'verified'
       and c.search_text like '%bowman%'
     limit 300`,
  ],
  [
    "2024 + number",
    `explain (analyze, buffers, format json)
     select c.id
     from public.card_catalog c
     where c.status = 'verified'
       and c.year_label like '2024%'
       and lower(c.card_number) = '332'
     limit 300`,
  ],
];

const probeLines = [];
for (const [name, sql] of probes) {
  const raw = psql(sql);
  const plan = JSON.parse(raw)[0];
  const summary = summarize(plan);
  probeLines.push({
    probe: name,
    executionMs: Number(summary.execMs.toFixed(3)),
    planningMs: Number(summary.planMs.toFixed(3)),
    rows: summary.rows,
    scans: summary.scans,
  });
}

const typo = psql(
  `select extensions.word_similarity('wembanyma', public.norm('Victor Wembanyama'));`,
);
console.log(JSON.stringify({ search: lines, probes: probeLines, wembanymaWordSimilarity: Number(typo) }, null, 2));
JS
