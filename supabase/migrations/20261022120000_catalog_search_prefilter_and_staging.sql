-- Catalog search prefilter and user-submission queue.
-- Donnie reviews this file before it is applied. Do not run it on production
-- from this change. Additive: existing catalog rows stay status 'verified'.
-- Does not update or delete public.cards rows.
--
-- search_cards still tokenizes and ranks with catalog_token_hits. It first
-- keeps at most 300 trigram candidates so the ranking loop does not scan the
-- whole catalog. statement_timeout stays 1s.
-- A query with no player anchor, year, card number, or set word returns no rows.

create schema if not exists extensions;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

alter table public.card_catalog
  add column if not exists status text not null default 'verified',
  add column if not exists source text not null default 'seed',
  add column if not exists source_ref text,
  add column if not exists submitted_by uuid references auth.users (id) on delete set null,
  add column if not exists is_rookie boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.card_catalog
  add column if not exists player_norm text
  generated always as (public.norm(player)) stored;

alter table public.card_catalog
  drop constraint if exists card_catalog_status_check;

alter table public.card_catalog
  add constraint card_catalog_status_check
  check (status in ('verified', 'pending', 'rejected'));

create index if not exists card_catalog_player_norm_trgm
  on public.card_catalog using gin (player_norm extensions.gin_trgm_ops);

create index if not exists card_catalog_year_num_idx
  on public.card_catalog (year_label, lower(card_number));

create index if not exists card_catalog_status_idx
  on public.card_catalog (status)
  where status <> 'verified';

-- Staging for user submissions and later imports. Search never reads this table.
create table if not exists public.catalog_staging (
  id bigserial primary key,
  batch text not null,
  sport text,
  year_label text,
  product text,
  subset text,
  player text,
  card_number text,
  parallel text,
  serial_run int,
  is_rookie boolean,
  source text not null,
  source_ref text,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_card_id uuid,
  review text not null default 'new' check (review in ('new', 'approved', 'merged', 'rejected')),
  review_note text,
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_staging_submitted_card_uidx
  on public.catalog_staging (submitted_card_id);

create index if not exists catalog_staging_batch_review_idx
  on public.catalog_staging (batch, review);

create table if not exists public.catalog_search_misses (
  id bigserial primary key,
  q text not null,
  results int not null,
  created_at timestamptz not null default now()
);

create index if not exists catalog_search_misses_created_idx
  on public.catalog_search_misses (created_at desc);

alter table public.catalog_staging enable row level security;
alter table public.catalog_search_misses enable row level security;

revoke all on public.catalog_staging from public, anon, authenticated;
revoke all on public.catalog_search_misses from public, anon, authenticated;
revoke all on sequence public.catalog_staging_id_seq from public, anon, authenticated;
revoke all on sequence public.catalog_search_misses_id_seq from public, anon, authenticated;

drop policy if exists "card_catalog_select_public" on public.card_catalog;
create policy "card_catalog_select_public"
  on public.card_catalog
  for select
  to anon, authenticated
  using (status = 'verified');

create or replace function public.search_cards(q text, max_results int default 20)
returns table (
  id uuid,
  player text,
  year_label text,
  set_name text,
  card_number text,
  parallel text,
  sport text,
  score double precision
)
language plpgsql
stable
security invoker
set search_path = public, extensions
set statement_timeout = '1s'
set pg_trgm.word_similarity_threshold = 0.5
as $$
declare
  nq text;
  tokens text[];
  tok text;
  card_num text := null;
  year_tok text := null;
  set_words text[] := '{}';
  player_tokens text[] := '{}';
  expanded text[] := '{}';
  match_tokens text[] := '{}';
  known_sets text[] := array[
    'prizm', 'select', 'optic', 'hoops', 'chrome', 'topps', 'bowman',
    'donruss', 'fleer', 'upper', 'deck', 'update', 'series', 'wnba',
    'opeeche', 'o-pee-chee', 'pee', 'chee'
  ];
  alias_player text;
  i int;
  pair text;
  a text;
  b text;
  start_y int;
  end_y int;
  limit_n int := greatest(1, least(coalesce(max_results, 20), 50));
  rec record;
  grade_skip int := 0;
  filler_words text[] := array['rookie', 'rookies', 'rc', 'card', 'cards', 'raw'];
  grader_words text[] := array['psa', 'bgs', 'sgc', 'cgc', 'beckett', 'graded', 'gem', 'mint'];
  -- Keep in sync with PARALLEL_ANCHOR_SKIP in lib/card-search-query.ts.
  parallel_hints text[] := array[
    'base', 'silver', 'holo', 'refractor', 'green', 'gold', 'golden',
    'red', 'blue', 'purple', 'orange', 'pink', 'black', 'white', 'yellow',
    'velocity', 'pandora', 'shimmer', 'cracked', 'snakeskin', 'wave', 'scope', 'ice'
  ];
  anchor_tok text := null;
  set_anchor text := null;
begin
  if q is null or length(trim(q)) = 0 or length(q) > 100 then
    return;
  end if;

  nq := public.norm(q);
  if nq is null or nq = '' then
    return;
  end if;

  tokens := regexp_split_to_array(nq, '\s+');

  foreach tok in array tokens loop
    if tok is null or tok = '' then
      continue;
    end if;

    -- Review fix: words like "rookie", "rc", "psa 10" describe the copy, not
    -- the catalog card. Skip them so they do not empty the result list.
    if tok = any(grader_words) then
      grade_skip := 2;
      continue;
    end if;
    if grade_skip > 0 and tok ~ '^\d{1,2}$' then
      grade_skip := grade_skip - 1;
      continue;
    end if;
    grade_skip := 0;
    if tok = any(filler_words) then
      continue;
    end if;

    if year_tok is null and tok ~ '^(19|20)\d{2}$' then
      year_tok := tok;
      continue;
    end if;

    if year_tok is null and tok ~ '^(19|20)\d{2}-\d{2}$' then
      year_tok := tok;
      continue;
    end if;

    if year_tok is null and tok ~ '^\d{2}-\d{2}$' then
      a := split_part(tok, '-', 1);
      b := split_part(tok, '-', 2);
      start_y := a::int;
      end_y := b::int;
      if (start_y + 1) % 100 = end_y then
        year_tok := (case when start_y >= 50 then 1900 else 2000 end + start_y)::text
          || '-' || lpad(end_y::text, 2, '0');
        continue;
      end if;
    end if;

    if card_num is null
      and tok ~ '\d'
      and tok !~ '^(19|20)\d{2}$'
      and tok !~ '^(19|20)\d{2}-\d{2}$'
      and tok !~ '^\d{4}$'
      and (
        tok ~ '^\d{1,3}$'
        or tok ~ '^[a-z]{1,4}\d+[a-z0-9]*(?:-[a-z0-9]+)?$'
        or tok ~ '^[a-z0-9]+(?:-[a-z0-9]+)+$'
        or tok ~ '^\d+[a-z]+$'
      )
    then
      card_num := upper(tok);
      continue;
    end if;

    if tok = any(known_sets) then
      set_words := array_append(set_words, tok);
      continue;
    end if;

    player_tokens := array_append(player_tokens, tok);
  end loop;

  i := 1;
  while i <= coalesce(array_length(player_tokens, 1), 0) loop
    if i < coalesce(array_length(player_tokens, 1), 0) then
      pair := player_tokens[i] || ' ' || player_tokens[i + 1];
      select pa.player into alias_player
      from public.player_aliases pa
      where pa.alias = pair;
      if found then
        expanded := expanded || regexp_split_to_array(public.norm(alias_player), '\s+');
        i := i + 2;
        continue;
      end if;
    end if;

    select pa.player into alias_player
    from public.player_aliases pa
    where pa.alias = player_tokens[i];
    if found then
      expanded := expanded || regexp_split_to_array(public.norm(alias_player), '\s+');
    else
      expanded := array_append(expanded, player_tokens[i]);
    end if;
    i := i + 1;
  end loop;

  match_tokens := expanded;
  if year_tok is not null then
    match_tokens := array_append(match_tokens, year_tok);
  end if;
  if coalesce(array_length(set_words, 1), 0) > 0 then
    match_tokens := match_tokens || set_words;
  end if;
  if card_num is not null then
    match_tokens := array_append(match_tokens, lower(card_num));
  end if;

  if coalesce(array_length(match_tokens, 1), 0) = 0 then
    return;
  end if;

  foreach tok in array expanded loop
    if tok is null or tok = '' or tok = any(parallel_hints) then
      continue;
    end if;
    if anchor_tok is null or length(tok) > length(anchor_tok) then
      anchor_tok := tok;
    end if;
  end loop;

  if coalesce(array_length(set_words, 1), 0) > 0 then
    foreach tok in array set_words loop
      if set_anchor is null or length(tok) > length(set_anchor) then
        set_anchor := tok;
      end if;
    end loop;
  end if;

  -- No player, year, number, or set word: do not scan the catalog.
  if anchor_tok is null and year_tok is null and card_num is null and set_anchor is null then
    return;
  end if;

  for rec in
    with cand as materialized (
      select
        c.id,
        c.player,
        c.year_label,
        c.set_name,
        c.card_number,
        c.parallel,
        c.sport,
        c.player_norm
      from public.card_catalog c
      where c.status = 'verified'
        and (
          year_tok is null
          or c.year_label like left(year_tok, 4) || '%'
        )
        and (
          card_num is null
          or lower(c.card_number) = lower(card_num)
        )
        and (
          (
            anchor_tok is not null
            and (
              anchor_tok <% c.player_norm
              or c.player_norm like '%' || anchor_tok || '%'
              or c.search_text like '%' || anchor_tok || '%'
            )
          )
          or (
            anchor_tok is null
            and set_anchor is not null
            and c.search_text like '%' || set_anchor || '%'
          )
          or (
            anchor_tok is null
            and set_anchor is null
            and (year_tok is not null or card_num is not null)
          )
        )
      order by
        case
          when anchor_tok is null then 0::double precision
          else extensions.word_similarity(anchor_tok, c.player_norm)::double precision
        end desc,
        c.player asc,
        c.id asc
      limit 300
    )
    select
      cand.id as rid,
      cand.player as rplayer,
      cand.year_label as ryear,
      cand.set_name as rset,
      cand.card_number as rnum,
      cand.parallel as rpar,
      cand.sport as rsport,
      sum(h.player_hit)::int as player_hits,
      sum(h.year_hit)::int as year_hits,
      sum(h.set_hit)::int as set_hits,
      sum(h.number_hit)::int as number_hits,
      sum(h.parallel_hit)::int as parallel_hits,
      sum(h.exact_hit)::int as exact_hits
    from cand
    cross join unnest(match_tokens) as t(tok)
    cross join lateral public.catalog_token_hits(
      t.tok,
      cand.player,
      cand.year_label,
      cand.set_name,
      cand.card_number,
      cand.parallel
    ) as h
    group by cand.id, cand.player, cand.year_label, cand.set_name, cand.card_number, cand.parallel, cand.sport
    having bool_and(h.matched)
    order by
      sum(h.player_hit) desc,
      sum(h.year_hit) desc,
      sum(h.set_hit) desc,
      sum(h.number_hit) desc,
      sum(h.parallel_hit) desc,
      sum(h.exact_hit) desc,
      (lower(coalesce(cand.parallel, '')) = 'base') desc,
      cand.player asc,
      cand.year_label asc nulls last,
      cand.set_name asc nulls last,
      cand.card_number asc nulls last
    limit limit_n
  loop
    id := rec.rid;
    player := rec.rplayer;
    year_label := rec.ryear;
    set_name := rec.rset;
    card_number := rec.rnum;
    parallel := rec.rpar;
    sport := rec.rsport;
    score := (
      rec.player_hits * 1000
      + rec.year_hits * 100
      + rec.set_hits * 10
      + rec.number_hits
    )::double precision;
    return next;
  end loop;
end;
$$;


grant execute on function public.search_cards(text, int) to anon, authenticated;

comment on function public.search_cards(text, int) is
  'Ranked catalog search. Trigram prefilter keeps at most 300 verified candidates, then catalog_token_hits ranks them. statement_timeout is 1s.';

-- Copies the caller's own card into catalog_staging. Idempotent per card.
-- Security definer so it can insert into a table with no anon/auth policies.
-- It only reads public.cards; it never updates or deletes a card.
create or replace function public.submit_catalog_card(card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_player text;
  v_year int;
  v_year_label text;
  v_set text;
  v_set_name text;
  v_card_number text;
  v_parallel text;
  v_sport text;
  v_serial int;
  v_rookie boolean;
begin
  if uid is null or card_id is null then
    return;
  end if;

  select
    c.player,
    c.year,
    c.year_label,
    c."set",
    c.set_name,
    c.card_number,
    c.parallel,
    c.sport,
    c.serial_run,
    c.is_rookie
  into
    v_player,
    v_year,
    v_year_label,
    v_set,
    v_set_name,
    v_card_number,
    v_parallel,
    v_sport,
    v_serial,
    v_rookie
  from public.cards c
  where c.id = submit_catalog_card.card_id
    and c.user_id = uid;

  if not found then
    return;
  end if;

  insert into public.catalog_staging (
    batch,
    sport,
    year_label,
    product,
    player,
    card_number,
    parallel,
    serial_run,
    is_rookie,
    source,
    source_ref,
    submitted_by,
    submitted_card_id,
    review
  )
  values (
    'user',
    v_sport,
    coalesce(nullif(trim(v_year_label), ''), v_year::text),
    coalesce(nullif(trim(v_set_name), ''), nullif(trim(v_set), '')),
    v_player,
    nullif(trim(v_card_number), ''),
    coalesce(nullif(trim(v_parallel), ''), 'Base'),
    v_serial,
    coalesce(v_rookie, false),
    'user',
    submit_catalog_card.card_id::text,
    uid,
    submit_catalog_card.card_id,
    'new'
  )
  on conflict (submitted_card_id) do nothing;
end;
$$;

revoke all on function public.submit_catalog_card(uuid) from public;
grant execute on function public.submit_catalog_card(uuid) to authenticated;

comment on function public.submit_catalog_card(uuid) is
  'Insert the caller''s own card into catalog_staging once. Does not modify public.cards.';

-- Cheap miss log. Search stays read-only; the client calls this when search_cards returns 0 rows.
create or replace function public.log_catalog_search_miss(q text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := left(trim(coalesce(q, '')), 100);
begin
  if length(cleaned) < 3 then
    return;
  end if;
  insert into public.catalog_search_misses (q, results)
  values (cleaned, 0);
end;
$$;

revoke all on function public.log_catalog_search_miss(text) from public;
grant execute on function public.log_catalog_search_miss(text) to anon, authenticated;

comment on function public.log_catalog_search_miss(text) is
  'Record one catalog search that returned zero rows. Callers cannot read the log.';

-- Manual. Marks user submissions approved when 2+ different users share a normalized identity.
create or replace function public.approve_catalog_consensus()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  with grouped as (
    select
      public.norm(player) as player_n,
      public.norm(coalesce(year_label, '')) as year_n,
      public.norm(coalesce(product, '')) as product_n,
      public.norm(coalesce(card_number, '')) as number_n,
      public.norm(coalesce(parallel, 'Base')) as parallel_n
    from public.catalog_staging
    where source = 'user'
      and submitted_by is not null
      and review <> 'rejected'
      and public.norm(player) <> ''
    group by 1, 2, 3, 4, 5
    having count(distinct submitted_by) >= 2
  ),
  marked as (
    update public.catalog_staging as staging
    set review = 'approved'
    from grouped
    where staging.review = 'new'
      and staging.source = 'user'
      and public.norm(staging.player) = grouped.player_n
      and public.norm(coalesce(staging.year_label, '')) = grouped.year_n
      and public.norm(coalesce(staging.product, '')) = grouped.product_n
      and public.norm(coalesce(staging.card_number, '')) = grouped.number_n
      and public.norm(coalesce(staging.parallel, 'Base')) = grouped.parallel_n
    returning 1
  )
  select count(*)::integer into updated_count from marked;

  return updated_count;
end;
$$;

-- Manual. Idempotent insert of one approved batch into card_catalog, then mark those rows merged.
create or replace function public.promote_catalog_batch(batch text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  merged_count integer := 0;
begin
  if batch is null or length(trim(batch)) = 0 then
    raise exception 'batch is required'
      using errcode = '22023';
  end if;

  with eligible as (
    select
      id,
      player,
      year_label,
      product,
      card_number,
      coalesce(nullif(trim(parallel), ''), 'Base') as parallel,
      sport,
      coalesce(is_rookie, false) as is_rookie,
      source,
      source_ref
    from public.catalog_staging
    where catalog_staging.batch = promote_catalog_batch.batch
      and review = 'approved'
      and player is not null
      and length(trim(player)) > 0
  ),
  inserted as (
    insert into public.card_catalog (
      player,
      year_label,
      set_name,
      card_number,
      parallel,
      sport,
      is_rookie,
      source,
      source_ref,
      status
    )
    select
      player,
      year_label,
      product,
      card_number,
      parallel,
      sport,
      is_rookie,
      source,
      source_ref,
      'verified'
    from eligible
    on conflict (
      player,
      coalesce(year_label, ''),
      coalesce(set_name, ''),
      coalesce(card_number, ''),
      parallel
    )
    do nothing
    returning 1
  ),
  marked as (
    update public.catalog_staging as staging
    set review = 'merged'
    from eligible
    where staging.id = eligible.id
      and staging.review = 'approved'
    returning 1
  )
  select counts.marked_count
  into merged_count
  from (
    select
      (select count(*)::integer from inserted) as inserted_count,
      (select count(*)::integer from marked) as marked_count
  ) as counts;

  return merged_count;
end;
$$;

revoke all on function public.approve_catalog_consensus() from public, anon, authenticated;
revoke all on function public.promote_catalog_batch(text) from public, anon, authenticated;
grant execute on function public.approve_catalog_consensus() to service_role;
grant execute on function public.promote_catalog_batch(text) to service_role;

comment on function public.approve_catalog_consensus() is
  'Service role only. Approve user staging rows that share a normalized identity across 2+ users. Does not modify public.cards or run on a schedule.';

comment on function public.promote_catalog_batch(text) is
  'Service role only. Insert one approved batch into card_catalog (on conflict do nothing) and mark those staging rows merged. Does not modify public.cards.';
