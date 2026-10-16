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
  expanded_q text;
  alias_player text;
  i int;
  pair text;
  a text;
  b text;
  start_y int;
  end_y int;
  limit_n int := greatest(1, least(coalesce(max_results, 20), 50));
  threshold double precision := 0.28;
  rec record;
  emitted int := 0;
  best_sim double precision;
begin
  if q is null or length(trim(q)) = 0 then
    return;
  end if;

  if length(q) > 100 then
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
      and tok !~ '^(19|20)\d{2}$'
      and tok !~ '^(19|20)\d{2}-\d{2}$'
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

    if length(tok) >= 4 and exists (
      select 1
      from public.card_catalog c
      where public.norm(c.set_name) like '%' || tok || '%'
      limit 1
    ) then
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

  expanded_q := public.norm(concat_ws(
    ' ',
    array_to_string(expanded, ' '),
    year_tok,
    array_to_string(set_words, ' '),
    lower(coalesce(card_num, ''))
  ));

  -- Junk queries like zzqxv: no alias, no structure, weak best similarity
  if card_num is null
    and year_tok is null
    and coalesce(array_length(set_words, 1), 0) = 0
    and not exists (select 1 from public.player_aliases pa where pa.alias = any(tokens) or pa.alias = nq)
  then
    select max(extensions.similarity(c.search_text, expanded_q)) into best_sim
    from public.card_catalog c;
    if coalesce(best_sim, 0) < 0.18 then
      return;
    end if;
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
      (
        extensions.similarity(c.search_text, expanded_q)
        + extensions.word_similarity(
            public.norm(c.player),
            coalesce(nullif(array_to_string(expanded, ' '), ''), expanded_q)
          )
        + case
            when card_num is not null and upper(c.card_number) = card_num then 2.2
            else 0
          end
        + case
            when year_tok is not null and (
              public.norm(coalesce(c.year_label, '')) = year_tok
              or public.norm(coalesce(c.year_label, '')) like year_tok || '%'
              or left(public.norm(coalesce(c.year_label, '')), 4) = left(year_tok, 4)
            ) then 1.1
            else 0
          end
        + case
            when coalesce(array_length(set_words, 1), 0) > 0
              and (
                select bool_and(public.norm(coalesce(c.set_name, '')) like '%' || sw || '%')
                from unnest(set_words) as sw
              )
            then 1.0 * array_length(set_words, 1)
            else 0
          end
      )::double precision as rscore
    from public.card_catalog c
    where
      extensions.similarity(c.search_text, expanded_q) >= 0.1
      or extensions.word_similarity(
        public.norm(c.player),
        coalesce(nullif(array_to_string(expanded, ' '), ''), expanded_q)
      ) >= 0.3
      or (card_num is not null and upper(c.card_number) = card_num)
    order by
      (card_num is not null and upper(c.card_number) = card_num) desc,
      (lower(coalesce(c.parallel, '')) = 'base') desc,
      rscore desc,
      c.player asc
  loop
    if card_num is not null and upper(rec.rnum) = card_num then
      -- keep exact card-number hits even if score is mostly from the boost
      null;
    elsif rec.rscore < threshold then
      continue;
    end if;

    id := rec.rid;
    player := rec.rplayer;
    year_label := rec.ryear;
    set_name := rec.rset;
    card_number := rec.rnum;
    parallel := rec.rpar;
    sport := rec.rsport;
    score := rec.rscore;
    return next;

    emitted := emitted + 1;
    exit when emitted >= limit_n;
  end loop;
end;
$$;

grant execute on function public.search_cards(text, int) to anon, authenticated;
grant execute on function public.norm(text) to anon, authenticated;
