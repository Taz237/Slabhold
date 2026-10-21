-- Add Card search ranking (QA review-fixed version of PR #24's SQL).
-- Changes vs the PR: parallel words match the parallel (ranked last), and
-- filler words (rookie, rc, card, psa 10, ...) are ignored.
-- Every query word must match the player, year, set, or card number.
-- Matches are case and accent insensitive, and partial words count ("wemb").
-- Rank player-name matches, then year, then set, then card number.
-- Safe to re-run: create or replace function, insert ... on conflict do nothing.
-- Mirrors lib/card-search-query.ts. Do not edit older search migrations.
--
-- public.norm() was storing season years as "202-- 4" because E'\1' is octal
-- character 1, not a regexp backreference. "2023" then matched Stroud's plain
-- 2023 and missed Wembanyama's 2023-24. The replacement below keeps hyphens.

-- Optional read-only pre-check (run first; each should return 0 rows besides
-- card_catalog.search_text and the search functions in this file):
--   select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where p.prosrc ilike '%norm(%' and n.nspname not in ('pg_catalog', 'extensions');
--   select indexname, indexdef from pg_indexes where indexdef ilike '%norm(%';
--   select attrelid::regclass, attname from pg_attribute
--     where attgenerated = 's' and pg_get_expr((select adbin from pg_attrdef d
--       where d.adrelid = attrelid and d.adnum = attnum), attrelid) ilike '%norm(%';

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
          '\1' || chr(1) || '\2',
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

create or replace function public.catalog_bigram_similarity(left_text text, right_text text)
returns double precision
language sql
stable
parallel safe
as $$
  with grams as (
    select 'l'::text as side, substr(left_text, gs, 2) as g
    from generate_series(1, length(left_text) - 1) as gs
    where left_text is not null and length(left_text) >= 2
    union all
    select 'r'::text, substr(right_text, gs, 2)
    from generate_series(1, length(right_text) - 1) as gs
    where right_text is not null and length(right_text) >= 2
  ),
  counts as (
    select side, g, count(*)::numeric as n
    from grams
    group by side, g
  ),
  overlap as (
    select coalesce(sum(least(l.n, r.n)), 0) as n
    from counts l
    join counts r on r.g = l.g and r.side = 'r'
    where l.side = 'l'
  )
  select case
    when left_text is null or right_text is null or left_text = '' or right_text = '' then 0::double precision
    when left_text = right_text then 1::double precision
    when length(left_text) < 2 or length(right_text) < 2 then
      case
        when position(right_text in left_text) > 0 or position(left_text in right_text) > 0 then 0.5
        else 0::double precision
      end
    else (
      select (2 * overlap.n / (length(left_text) - 1 + length(right_text) - 1))::double precision
      from overlap
    )
  end;
$$;

-- Review fix: the 5-argument version from the first draft of this file is
-- replaced by a 6-argument one that also checks the parallel. Nothing else
-- depends on it, so dropping it is safe and keeps this file re-runnable.
drop function if exists public.catalog_token_hits(text, text, text, text, text);

create or replace function public.catalog_token_hits(
  tok text,
  player text,
  year_label text,
  set_name text,
  card_number text,
  parallel text,
  out player_hit int,
  out year_hit int,
  out set_hit int,
  out number_hit int,
  out parallel_hit int,
  out exact_hit int,
  out matched boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  words text[];
  parts text[];
  collapsed text[] := '{}';
  buf text := '';
  w text;
  full_set text;
  year_canon text;
  start_y int;
  end_y int;
  num text;
begin
  player_hit := 0;
  year_hit := 0;
  set_hit := 0;
  number_hit := 0;
  parallel_hit := 0;
  exact_hit := 0;
  matched := false;

  if tok is null or tok = '' then
    return;
  end if;

  words := coalesce(
    regexp_split_to_array(coalesce(public.norm(player), ''), '\s+'),
    '{}'::text[]
  );

  foreach w in array words loop
    if w is null or w = '' then
      continue;
    end if;
    if length(w) = 1 then
      buf := buf || w;
    else
      if buf <> '' then
        collapsed := array_append(collapsed, buf);
        buf := '';
      end if;
      collapsed := array_append(collapsed, w);
    end if;
  end loop;
  if buf <> '' then
    collapsed := array_append(collapsed, buf);
  end if;

  if tok = any(words) or tok = any(collapsed) then
    player_hit := 1;
    exact_hit := 1;
    matched := true;
    return;
  end if;

  foreach w in array words loop
    if w is null or w = '' then
      continue;
    end if;
    if length(tok) >= 3
      and left(w, length(tok)) = tok
      and length(tok)::numeric / length(w)::numeric <= 0.7
    then
      player_hit := 1;
      matched := true;
      return;
    end if;
    if length(tok) >= 4
      and abs(length(w) - length(tok)) <= 2
      and public.catalog_bigram_similarity(tok, w) >= 0.75
    then
      player_hit := 1;
      matched := true;
      return;
    end if;
  end loop;

  year_canon := null;
  if tok ~ '^(19|20)\d{2}$' or tok ~ '^(19|20)\d{2}-\d{2}$' then
    year_canon := tok;
  elsif tok ~ '^\d{2}-\d{2}$' then
    start_y := split_part(tok, '-', 1)::int;
    end_y := split_part(tok, '-', 2)::int;
    if (start_y + 1) % 100 = end_y then
      year_canon := (case when start_y >= 50 then 1900 else 2000 end + start_y)::text
        || '-' || lpad(end_y::text, 2, '0');
    end if;
  end if;

  if year_canon is not null and public.norm(year_label) = year_canon then
    year_hit := 2;
    matched := true;
    return;
  end if;

  if year_canon is not null
    and left(coalesce(public.norm(year_label), ''), 4) = left(year_canon, 4)
  then
    year_hit := 1;
    matched := true;
    return;
  end if;

  full_set := coalesce(public.norm(set_name), '');
  if full_set <> '' and tok = full_set then
    set_hit := 1;
    matched := true;
    return;
  end if;

  parts := coalesce(
    regexp_split_to_array(replace(full_set, '-', ' '), '\s+'),
    '{}'::text[]
  );
  foreach w in array parts loop
    if w is null or w = '' then
      continue;
    end if;
    if w = tok
      or (
        length(tok) >= 3
        and left(w, length(tok)) = tok
        and length(tok)::numeric / length(w)::numeric <= 0.7
      )
      or (
        length(tok) >= 4
        and abs(length(w) - length(tok)) <= 2
        and public.catalog_bigram_similarity(tok, w) >= 0.75
      )
    then
      set_hit := 1;
      matched := true;
      return;
    end if;
  end loop;

  num := null;
  if tok ~ '\d'
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
    num := upper(tok);
  end if;

  if num is not null and upper(coalesce(card_number, '')) = num then
    number_hit := 1;
    matched := true;
    return;
  end if;

  -- Parallel words ("silver", "holo", "refractor", "base") match the parallel.
  parts := coalesce(
    regexp_split_to_array(replace(coalesce(public.norm(parallel), ''), '-', ' '), '\s+'),
    '{}'::text[]
  );
  foreach w in array parts loop
    if w is null or w = '' then
      continue;
    end if;
    if w = tok
      or (
        length(tok) >= 3
        and left(w, length(tok)) = tok
        and length(tok)::numeric / length(w)::numeric <= 0.7
      )
    then
      parallel_hit := 1;
      matched := true;
      return;
    end if;
  end loop;
end;
$$;

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

  for rec in
    select
      c.id as rid,
      c.player as rplayer,
      c.year_label as ryear,
      c.set_name as rset,
      c.card_number as rnum,
      c.parallel as rpar,
      c.sport as rsport,
      sum(h.player_hit)::int as player_hits,
      sum(h.year_hit)::int as year_hits,
      sum(h.set_hit)::int as set_hits,
      sum(h.number_hit)::int as number_hits,
      sum(h.parallel_hit)::int as parallel_hits,
      sum(h.exact_hit)::int as exact_hits
    from public.card_catalog c
    cross join unnest(match_tokens) as t(tok)
    cross join lateral public.catalog_token_hits(
      t.tok,
      c.player,
      c.year_label,
      c.set_name,
      c.card_number,
      c.parallel
    ) as h
    group by c.id, c.player, c.year_label, c.set_name, c.card_number, c.parallel, c.sport
    having bool_and(h.matched)
    order by
      sum(h.player_hit) desc,
      sum(h.year_hit) desc,
      sum(h.set_hit) desc,
      sum(h.number_hit) desc,
      sum(h.parallel_hit) desc,
      sum(h.exact_hit) desc,
      (lower(coalesce(c.parallel, '')) = 'base') desc,
      c.player asc,
      c.year_label asc nulls last,
      c.set_name asc nulls last,
      c.card_number asc nulls last
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

grant execute on function public.norm(text) to anon, authenticated;
grant execute on function public.catalog_bigram_similarity(text, text) to anon, authenticated;
grant execute on function public.catalog_token_hits(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.search_cards(text, int) to anon, authenticated;

-- Recompute search_text with the hyphen-safe norm. Same row values, no deletes.
update public.card_catalog set player = player;

-- Correct alias keys (ant-man). Old broken keys are left in place.
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

-- Verified from in-repo card identity (comps, owners, fair-price fixtures):
-- Jaxson Dart, 2025, Panini Prizm, #332, Base. Football matches the catalog's
-- calendar-year label for that product ("Giants", "1st Round Draft").
insert into public.card_catalog (player, year_label, set_name, card_number, parallel, sport)
values ('Jaxson Dart', '2025', 'Panini Prizm', '332', 'Base', 'Football')
on conflict do nothing;
