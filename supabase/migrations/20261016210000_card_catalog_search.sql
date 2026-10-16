-- Typo-tolerant, nickname-aware Add Card search catalog.

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
          E'\1' || chr(1) || E'\2',
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
  ('Victor Wembanyama', '2023-24', 'Panini Prizm', '136', 'Silver', 'Basketball'),
  ('Victor Wembanyama', '2023-24', 'Panini Select', '1', 'Base', 'Basketball'),
  ('Victor Wembanyama', '2023-24', 'Hoops', '277', 'Base', 'Basketball'),
  ('Caitlin Clark', '2024-25', 'Panini Prizm WNBA', '101', 'Base', 'Basketball'),
  ('Caitlin Clark', '2024-25', 'Panini Donruss', '1', 'Base', 'Basketball'),
  ('Luka Dončić', '2018-19', 'Panini Optic', '177', 'Holo', 'Basketball'),
  ('Luka Dončić', '2018-19', 'Panini Prizm', '280', 'Silver', 'Basketball'),
  ('Stephen Curry', '2009-10', 'Topps', '321', 'Base', 'Basketball'),
  ('LeBron James', '2003-04', 'Topps Chrome', '111', 'Refractor', 'Basketball'),
  ('Anthony Edwards', '2020-21', 'Panini Prizm', '258', 'Silver', 'Basketball'),
  ('Paolo Banchero', '2022-23', 'Panini Prizm', '249', 'Silver', 'Basketball'),
  ('Chet Holmgren', '2022-23', 'Panini Prizm', '236', 'Silver', 'Basketball'),
  ('Ja Morant', '2019-20', 'Panini Prizm', '249', 'Silver', 'Basketball'),
  ('Zion Williamson', '2019-20', 'Panini Prizm', '248', 'Silver', 'Basketball'),
  ('Jayson Tatum', '2017-18', 'Panini Prizm', '16', 'Silver', 'Basketball'),
  ('Michael Jordan', '1986-87', 'Fleer', '57', 'Base', 'Basketball'),
  ('Shai Gilgeous-Alexander', '2023-24', 'Panini Prizm', '230', 'Base', 'Basketball'),
  ('Giannis Antetokounmpo', '2013-14', 'Panini Prizm', '290', 'Base', 'Basketball'),
  ('Kevin Durant', '2007-08', 'Topps', '2', 'Base', 'Basketball'),
  ('Nikola Jokic', '2015-16', 'Panini Prizm', '335', 'Base', 'Basketball'),
  ('Shohei Ohtani', '2018', 'Topps Update', 'US1', 'Base', 'Baseball'),
  ('Shohei Ohtani', '2018', 'Topps Chrome', '150', 'Refractor', 'Baseball'),
  ('Shohei Ohtani', '2024', 'Topps Series 1', '1', 'Base', 'Baseball'),
  ('Aaron Judge', '2017', 'Topps Chrome', '169', 'Refractor', 'Baseball'),
  ('Aaron Judge', '2017', 'Topps Update', 'US200', 'Base', 'Baseball'),
  ('Elly De La Cruz', '2024', 'Topps Chrome', '2', 'Refractor', 'Baseball'),
  ('Paul Skenes', '2024', 'Topps Update', 'US50', 'Base', 'Baseball'),
  ('Bobby Witt Jr.', '2022', 'Bowman Chrome', 'BCP-1', 'Refractor', 'Baseball'),
  ('Ronald Acuna Jr.', '2018', 'Topps Update', 'US250', 'Base', 'Baseball'),
  ('Juan Soto', '2018', 'Topps Update', 'US300', 'Base', 'Baseball'),
  ('Mike Trout', '2011', 'Topps Update', 'US175', 'Base', 'Baseball'),
  ('Ken Griffey Jr.', '1989', 'Upper Deck', '1', 'Base', 'Baseball'),
  ('Patrick Mahomes', '2017', 'Panini Prizm', '269', 'Silver', 'Football'),
  ('Patrick Mahomes', '2017', 'Panini Optic', '177', 'Holo', 'Football'),
  ('Justin Herbert', '2020', 'Panini Prizm', '325', 'Green', 'Football'),
  ('Justin Herbert', '2020', 'Panini Optic', '153', 'Holo', 'Football'),
  ('Caleb Williams', '2024', 'Panini Prizm', '301', 'Silver', 'Football'),
  ('Jayden Daniels', '2024', 'Panini Prizm', '389', 'Silver', 'Football'),
  ('Joe Burrow', '2020', 'Panini Prizm', '307', 'Silver', 'Football'),
  ('Josh Allen', '2018', 'Panini Prizm', '205', 'Silver', 'Football'),
  ('Lamar Jackson', '2018', 'Panini Prizm', '212', 'Silver', 'Football'),
  ('C.J. Stroud', '2023', 'Panini Prizm', '339', 'Silver', 'Football'),
  ('Travis Hunter', '2025', 'Panini Prizm', '1', 'Silver', 'Football'),
  ('Connor Bedard', '2023-24', 'Upper Deck', '201', 'Base', 'Hockey'),
  ('Connor Bedard', '2023-24', 'Upper Deck Series 2', '451', 'Base', 'Hockey'),
  ('Connor McDavid', '2015-16', 'Upper Deck', '201', 'Base', 'Hockey'),
  ('Auston Matthews', '2016-17', 'Upper Deck', '201', 'Base', 'Hockey'),
  ('Sidney Crosby', '2005-06', 'Upper Deck', '201', 'Base', 'Hockey'),
  ('Wayne Gretzky', '1979-80', 'O-Pee-Chee', '18', 'Base', 'Hockey'),
  ('Lionel Messi', '2023', 'Topps Chrome', '1', 'Refractor', 'Soccer'),
  ('Cristiano Ronaldo', '2023', 'Topps Chrome', '150', 'Refractor', 'Soccer'),
  ('Erling Haaland', '2023', 'Topps Chrome', '50', 'Refractor', 'Soccer'),
  ('Victor Wembanyama', '2023-24', 'Panini Prizm', '136', 'Base', 'Basketball'),
  ('Luka Dončić', '2018-19', 'Panini Optic', '177', 'Base', 'Basketball'),
  ('Luka Dončić', '2018-19', 'Panini Prizm', '280', 'Base', 'Basketball'),
  ('LeBron James', '2003-04', 'Topps Chrome', '111', 'Base', 'Basketball'),
  ('Anthony Edwards', '2020-21', 'Panini Prizm', '258', 'Base', 'Basketball'),
  ('Paolo Banchero', '2022-23', 'Panini Prizm', '249', 'Base', 'Basketball'),
  ('Chet Holmgren', '2022-23', 'Panini Prizm', '236', 'Base', 'Basketball'),
  ('Ja Morant', '2019-20', 'Panini Prizm', '249', 'Base', 'Basketball'),
  ('Zion Williamson', '2019-20', 'Panini Prizm', '248', 'Base', 'Basketball'),
  ('Jayson Tatum', '2017-18', 'Panini Prizm', '16', 'Base', 'Basketball'),
  ('Shohei Ohtani', '2018', 'Topps Chrome', '150', 'Base', 'Baseball'),
  ('Aaron Judge', '2017', 'Topps Chrome', '169', 'Base', 'Baseball'),
  ('Elly De La Cruz', '2024', 'Topps Chrome', '2', 'Base', 'Baseball'),
  ('Bobby Witt Jr.', '2022', 'Bowman Chrome', 'BCP-1', 'Base', 'Baseball'),
  ('Patrick Mahomes', '2017', 'Panini Prizm', '269', 'Base', 'Football'),
  ('Patrick Mahomes', '2017', 'Panini Optic', '177', 'Base', 'Football'),
  ('Justin Herbert', '2020', 'Panini Prizm', '325', 'Base', 'Football'),
  ('Justin Herbert', '2020', 'Panini Optic', '153', 'Base', 'Football'),
  ('Caleb Williams', '2024', 'Panini Prizm', '301', 'Base', 'Football'),
  ('Jayden Daniels', '2024', 'Panini Prizm', '389', 'Base', 'Football'),
  ('Joe Burrow', '2020', 'Panini Prizm', '307', 'Base', 'Football'),
  ('Josh Allen', '2018', 'Panini Prizm', '205', 'Base', 'Football'),
  ('Lamar Jackson', '2018', 'Panini Prizm', '212', 'Base', 'Football'),
  ('C.J. Stroud', '2023', 'Panini Prizm', '339', 'Base', 'Football'),
  ('Travis Hunter', '2025', 'Panini Prizm', '1', 'Base', 'Football'),
  ('Lionel Messi', '2023', 'Topps Chrome', '1', 'Base', 'Soccer'),
  ('Cristiano Ronaldo', '2023', 'Topps Chrome', '150', 'Base', 'Soccer'),
  ('Erling Haaland', '2023', 'Topps Chrome', '50', 'Base', 'Soccer')
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

