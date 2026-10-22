-- Rookie words in catalog search.
-- Replaces public.search_cards(text, int). Adding is_rookie changes the
-- return type, so the function is dropped and created again in this
-- transaction, with the same argument signature, security definer,
-- search_path '', verified-only filter, statement_timeout, trigram
-- threshold, and grants.
-- "rated rookie", "rated rookies", "rookie", "rookies", and "rc" are not
-- player, set, or parallel words. When any are present, is_rookie rows rank
-- first. Mirrors lib/card-search-query.ts.
-- Does not insert, update, or delete catalog or user rows.
-- Donnie reviews this file before it is applied. Do not run it on production
-- from this change.

set local lock_timeout = '5s';

drop function if exists public.search_cards(text, int);

create or replace function public.search_cards(q text, max_results int default 20)
returns table (
  id uuid,
  player text,
  year_label text,
  set_name text,
  card_number text,
  parallel text,
  sport text,
  score double precision,
  is_rookie boolean
)
language plpgsql
stable
-- Definer so the trigram indexes are usable: under RLS the planner cannot use
-- non-leakproof LIKE / ~ / <% as index conditions, so anon and authenticated
-- callers got a sequential scan. The query below filters status = 'verified'
-- itself and only reads card_catalog and player_aliases. public and extensions
-- are not writable by anon or authenticated. search_path is empty; extension
-- operators and functions are schema-qualified.
security definer
set search_path = ''
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
  filler_words text[] := array['card', 'cards', 'raw'];
  grader_words text[] := array['psa', 'bgs', 'sgc', 'cgc', 'beckett', 'graded', 'gem', 'mint'];
  -- Keep in sync with PARALLEL_ANCHOR_SKIP in lib/card-search-query.ts.
  parallel_hints text[] := array[
    'base', 'silver', 'holo', 'refractor', 'green', 'gold', 'golden',
    'red', 'blue', 'purple', 'orange', 'pink', 'black', 'white', 'yellow',
    'velocity', 'pandora', 'shimmer', 'cracked', 'snakeskin', 'wave', 'scope', 'ice'
  ];
  anchor_tok text := null;
  set_anchor text := null;
  cand_words text[] := '{}';
  long_words text[] := '{}';
  phrase text := null;
  word_pattern text := null;
  num_pattern text := null;
  want_rookie boolean := false;
  token_count int := 0;
  ti int := 1;
begin
  if q is null or length(trim(q)) = 0 or length(q) > 100 then
    return;
  end if;

  nq := public.norm(q);
  if nq is null or nq = '' then
    return;
  end if;

  tokens := regexp_split_to_array(nq, '\s+');
  token_count := coalesce(array_length(tokens, 1), 0);
  ti := 1;

  while ti <= token_count loop
    tok := tokens[ti];
    if tok is null or tok = '' then
      ti := ti + 1;
      continue;
    end if;

    -- Words like "psa 10" describe the copy, not the catalog card.
    if tok = any(grader_words) then
      grade_skip := 2;
      ti := ti + 1;
      continue;
    end if;
    if grade_skip > 0 and tok ~ '^\d{1,2}$' then
      grade_skip := grade_skip - 1;
      ti := ti + 1;
      continue;
    end if;
    grade_skip := 0;

    -- "rated rookie", "rated rookies", "rookie", "rookies", and "rc" are
    -- rookie words. They are not player, set, or parallel matches.
    if tok = 'rated'
      and ti < token_count
      and tokens[ti + 1] in ('rookie', 'rookies')
    then
      want_rookie := true;
      ti := ti + 2;
      continue;
    end if;
    if tok in ('rookie', 'rookies', 'rc', 'rated-rookie', 'rated-rookies') then
      want_rookie := true;
      ti := ti + 1;
      continue;
    end if;
    if tok = any(filler_words) then
      ti := ti + 1;
      continue;
    end if;

    if year_tok is null and tok ~ '^(19|20)\d{2}$' then
      year_tok := tok;
      ti := ti + 1;
      continue;
    end if;

    if year_tok is null and tok ~ '^(19|20)\d{2}-\d{2}$' then
      year_tok := tok;
      ti := ti + 1;
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
        ti := ti + 1;
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
      ti := ti + 1;
      continue;
    end if;

    if tok = any(known_sets) then
      set_words := array_append(set_words, tok);
      ti := ti + 1;
      continue;
    end if;

    player_tokens := array_append(player_tokens, tok);
    ti := ti + 1;
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

  -- Every non-parallel word can find candidates, not only the longest one.
  -- "bo nix optic preview" must still reach Bo Nix, and "josh allen" must
  -- not lose Josh Allen behind 300 Allen Iverson rows.
  foreach tok in array expanded loop
    if tok is null or tok = '' or tok = any(parallel_hints) then
      continue;
    end if;
    if anchor_tok is null or length(tok) > length(anchor_tok) then
      anchor_tok := tok;
    end if;
    if not tok = any(cand_words) then
      cand_words := array_append(cand_words, tok);
      if length(tok) >= 3 then
        long_words := array_append(long_words, tok);
      end if;
    end if;
  end loop;

  if coalesce(array_length(cand_words, 1), 0) > 0 then
    phrase := array_to_string(cand_words, ' ');
    if coalesce(array_length(long_words, 1), 0) = 0 then
      long_words := cand_words;
    end if;
    word_pattern := '(' || array_to_string(
      array(select regexp_replace(w, '([^a-z0-9])', '\\\1', 'g') from unnest(long_words) as w),
      '|'
    ) || ')';
  end if;

  if card_num is not null then
    -- Also lets "series 2" / "series 1" match the set name, as before.
    num_pattern := '(^| )' || regexp_replace(lower(card_num), '([^a-z0-9])', '\\\1', 'g') || '( |$)';
  end if;

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
        c.player_norm,
        c.is_rookie
      from public.card_catalog c
      where c.status = 'verified'
        and (
          year_tok is null
          or c.year_label like left(year_tok, 4) || '%'
        )
        and (
          card_num is null
          or lower(c.card_number) = lower(card_num)
          or c.search_text ~ num_pattern
        )
        and (
          (
            word_pattern is not null
            and (
              c.player_norm ~ word_pattern
              or c.search_text ~ word_pattern
              or phrase operator(extensions.<%) c.player_norm
            )
          )
          or (
            word_pattern is null
            and set_anchor is not null
            and c.search_text like '%' || set_anchor || '%'
          )
          or (
            word_pattern is null
            and set_anchor is null
            and (year_tok is not null or card_num is not null)
          )
        )
      order by
        case when want_rookie then (c.is_rookie is true) else false end desc,
        extensions.word_similarity(
          array_to_string(match_tokens, ' '),
          c.search_text || ' ' || lower(c.parallel)
        ) desc,
        case
          when phrase is null then 0::double precision
          else extensions.word_similarity(phrase, c.player_norm)::double precision
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
      cand.is_rookie as ris_rookie,
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
    group by
      cand.id,
      cand.player,
      cand.year_label,
      cand.set_name,
      cand.card_number,
      cand.parallel,
      cand.sport,
      cand.is_rookie
    having bool_and(h.matched)
    order by
      case when want_rookie then (cand.is_rookie is true) else false end desc,
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
    is_rookie := rec.ris_rookie;
    return next;
  end loop;
end;
$$;

grant execute on function public.search_cards(text, int) to anon, authenticated;

comment on function public.search_cards(text, int) is
  'Ranked catalog search. Rookie words are not player, set, or parallel matches; when present, is_rookie rows rank first. Trigram prefilter keeps at most 300 verified candidates, then catalog_token_hits ranks them. statement_timeout is 1s.';
