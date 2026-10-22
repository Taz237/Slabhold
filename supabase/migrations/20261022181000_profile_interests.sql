-- What you collect, and server-side follow ranking.
-- Not applied. Donnie must approve this SQL before it is pushed.
-- Does not drop columns or delete user rows.
--
-- profile_interests is private to the owner (RLS).
-- suggest_collectors ranks other collectors from public cards, post text,
-- and want labels. It never returns card rows, prices, notes, or certs.
-- The ranker lives in private so the security-definer body is not an API RPC.
-- public.suggest_collectors is the invoker wrapper clients call.

begin;

set local lock_timeout = '5s';

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

alter table public.profiles
  add column if not exists is_test boolean not null default false;

comment on column public.profiles.is_test is
  'QA flag. Hidden from follow suggestions. Signed-in users cannot change it.';

create or replace function public.protect_profile_is_test()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service_role may set the flag through the API.
  -- postgres and supabase_admin may set it from the SQL editor.
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    if tg_op = 'INSERT' then
      new.is_test := false;
    else
      new.is_test := old.is_test;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_is_test on public.profiles;
create trigger protect_profile_is_test
  before insert or update on public.profiles
  for each row execute function public.protect_profile_is_test();

revoke all on function public.protect_profile_is_test() from public, anon, authenticated;

create table if not exists public.profile_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, value),
  constraint profile_interests_kind check (kind in ('sport', 'team', 'player', 'prompt')),
  constraint profile_interests_value_len check (char_length(btrim(value)) between 1 and 80),
  constraint profile_interests_prompt check (
    kind <> 'prompt' or value in ('done', 'skipped')
  )
);

comment on table public.profile_interests is
  'Sports, teams, and players a collector picked. prompt/done and prompt/skipped mean the question was answered.';

alter table public.profile_interests enable row level security;

revoke all on public.profile_interests from anon, authenticated, public;
grant select, insert, update, delete on public.profile_interests to authenticated;
grant select, insert, update, delete on public.profile_interests to service_role;

drop policy if exists "Read own interests" on public.profile_interests;
drop policy if exists "Insert own interests" on public.profile_interests;
drop policy if exists "Update own interests" on public.profile_interests;
drop policy if exists "Delete own interests" on public.profile_interests;

create policy "Read own interests"
  on public.profile_interests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Insert own interests"
  on public.profile_interests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update own interests"
  on public.profile_interests
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own interests"
  on public.profile_interests
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- At most 50 interest rows per user. An upsert of a row that already exists
-- is allowed so a save can refresh picks without tripping the cap.
create or replace function private.limit_profile_interests()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Serialize inserts per user so parallel requests can't each see 49 rows.
  perform pg_advisory_xact_lock(hashtextextended('profile_interests:' || new.user_id::text, 0));
  if exists (
    select 1
    from public.profile_interests
    where user_id = new.user_id
      and kind = new.kind
      and value = new.value
  ) then
    return new;
  end if;
  if (
    select count(*)
    from public.profile_interests
    where user_id = new.user_id
  ) >= 50 then
    raise exception 'profile interests are limited to 50 rows'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_profile_interests on public.profile_interests;
create trigger limit_profile_interests
  before insert on public.profile_interests
  for each row execute function private.limit_profile_interests();

revoke all on function private.limit_profile_interests() from public, anon, authenticated;

create index if not exists cards_public_user_player_idx
  on public.cards (user_id, player)
  where is_public;

create or replace function private.interest_short_name(raw text)
returns text
language sql
immutable
as $$
  with parts as (
    select regexp_split_to_array(btrim(coalesce(raw, '')), '\s+') as tokens
  ),
  trimmed as (
    select case
      when cardinality(tokens) > 1
        and lower(replace(tokens[cardinality(tokens)], '.', '')) in ('jr', 'sr', 'ii', 'iii', 'iv')
      then tokens[1:cardinality(tokens) - 1]
      else tokens
    end as tokens
    from parts
  )
  select coalesce(tokens[cardinality(tokens)], '')
  from trimmed;
$$;

create or replace function private.team_post_reason(team text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(team, '')) ~ '\s' then 'Posts about ' || btrim(team)
    else 'Posts about the ' || btrim(team)
  end;
$$;

-- Weight for one pick. Public cards only. Want labels are matched, never returned.
create or replace function private.collector_match_weight(
  collector uuid,
  interest_kind text,
  interest_value text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when interest_kind = 'player' and exists (
      select 1
      from public.public_cards c
      where c.user_id = collector
        and c.is_rookie is true
        and public.norm(c.player) = public.norm(interest_value)
    ) then 100
    when interest_kind = 'player' and exists (
      select 1
      from public.public_cards c
      where c.user_id = collector
        and public.norm(c.player) = public.norm(interest_value)
    ) then 80
    when interest_kind = 'team' and exists (
      select 1
      from public.posts post
      where post.user_id = collector
        and post.hidden_at is null
        and public.norm(interest_value) <> ''
        and position(public.norm(interest_value) in public.norm(post.content)) > 0
    ) then 70
    when interest_kind = 'player' and exists (
      select 1
      from public.posts post
      where post.user_id = collector
        and post.hidden_at is null
        and public.norm(interest_value) <> ''
        and (
          position(public.norm(interest_value) in public.norm(post.content)) > 0
          or public.norm(coalesce(post.card->>'player', '')) = public.norm(interest_value)
        )
    ) then 50
    when interest_kind = 'player' and exists (
      select 1
      from public.want_list w
      join public.profiles hunter on hunter.id = collector
      where w.user_id = collector
        and hunter.show_as_hunter is true
        and public.norm(interest_value) <> ''
        and position(public.norm(interest_value) in public.norm(w.label)) > 0
    ) then 40
    when interest_kind = 'team' and exists (
      select 1
      from public.want_list w
      join public.profiles hunter on hunter.id = collector
      where w.user_id = collector
        and hunter.show_as_hunter is true
        and public.norm(interest_value) <> ''
        and position(public.norm(interest_value) in public.norm(w.label)) > 0
    ) then 30
    when interest_kind = 'sport' and exists (
      select 1
      from public.public_cards c
      where c.user_id = collector
        and lower(c.sport) = lower(interest_value)
    ) then 20
    when interest_kind = 'sport' and exists (
      select 1
      from public.posts post
      where post.user_id = collector
        and post.hidden_at is null
        and public.norm(interest_value) <> ''
        and position(public.norm(interest_value) in public.norm(post.content)) > 0
    ) then 10
    else 0
  end;
$$;

create or replace function private.collector_match_reason(
  interest_kind text,
  interest_value text,
  weight integer
)
returns text
language sql
immutable
as $$
  select case weight
    when 100 then 'Collects ' || private.interest_short_name(interest_value) || ' rookies'
    when 80 then 'Collects ' || private.interest_short_name(interest_value)
    when 70 then private.team_post_reason(interest_value)
    when 50 then 'Posts about ' || private.interest_short_name(interest_value)
    when 40 then 'Wants ' || private.interest_short_name(interest_value)
    when 30 then 'Wants ' || btrim(interest_value)
    when 20 then 'Collects ' || btrim(interest_value)
    when 10 then 'Posts about ' || btrim(interest_value)
    else null
  end;
$$;

create or replace function private.suggest_collectors(max_results integer)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accent text,
  reason text,
  score integer
)
language sql
stable
security definer
set search_path = public
as $$
  -- No function-level statement_timeout. It does not override the PostgREST
  -- role timeout, and that role timeout is what bounds this RPC.
  with viewer as (
    select auth.uid() as id
  ),
  interests as (
    select kind, value
    from (
      select kind, btrim(value) as value
      from public.profile_interests
      where user_id = (select id from viewer)
        and kind in ('sport', 'team', 'player')
        and (select id from viewer) is not null
      order by created_at asc, kind, value
      limit 25
    ) picked
  ),
  matched as (
    select c.user_id as id
    from public.public_cards c
    join interests i
      on (i.kind = 'player' and public.norm(c.player) = public.norm(i.value))
      or (i.kind = 'sport' and lower(c.sport) = lower(i.value))
    union
    select post.user_id
    from public.posts post
    join interests i
      on post.hidden_at is null
     and post.created_at >= now() - interval '180 days'
     and public.norm(i.value) <> ''
     and (
       position(public.norm(i.value) in public.norm(post.content)) > 0
       or (
         i.kind = 'player'
         and public.norm(coalesce(post.card->>'player', '')) = public.norm(i.value)
       )
     )
    union
    select w.user_id
    from public.want_list w
    join public.profiles hunter
      on hunter.id = w.user_id
     and hunter.show_as_hunter is true
    join interests i
      on i.kind in ('player', 'team')
     and public.norm(i.value) <> ''
     and position(public.norm(i.value) in public.norm(w.label)) > 0
  ),
  eligible as (
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.accent,
      p.created_at
    from public.profiles p
    where (
        p.id in (select matched.id from matched)
        or p.username = 'slabhold'
      )
      and (
        (select id from viewer) is null
        or p.id <> (select id from viewer)
      )
      and (
        (select id from viewer) is null
        or not exists (
          select 1
          from public.follows f
          where f.follower_id = (select id from viewer)
            and f.following_id = p.id
        )
      )
      and (
        (select id from viewer) is null
        or not private.is_blocked((select id from viewer), p.id)
      )
      and (
        (select id from viewer) is null
        or not private.is_muted((select id from viewer), p.id)
      )
      and (
        p.username = 'slabhold'
        or (
          coalesce(p.is_test, false) = false
          and p.username <> 'grokbotreview'
          and left(p.username, 3) <> 'qa_'
          and left(p.username, 3) <> 'qa-'
          and left(p.username, 5) <> 'test_'
          and left(p.username, 7) <> 'vreset_'
          and p.username <> 'qa_vreset_1021'
        )
      )
  ),
  scored as (
    select
      e.id,
      e.username,
      e.display_name,
      e.avatar_url,
      e.accent,
      e.created_at,
      coalesce(sum(hit.weight), 0)::integer as match_score,
      (
        array_agg(
          private.collector_match_reason(hit.kind, hit.value, hit.weight)
          order by hit.weight desc, hit.value
        ) filter (where hit.weight > 0)
      )[1] as match_reason
    from eligible e
    left join lateral (
      select
        i.kind,
        i.value,
        private.collector_match_weight(e.id, i.kind, i.value) as weight
      from interests i
    ) hit on true
    group by e.id, e.username, e.display_name, e.avatar_url, e.accent, e.created_at
  ),
  ranked as (
    select
      scored.*,
      row_number() over (
        order by match_score desc, created_at asc, username asc
      ) as rn
    from scored
  ),
  lim as (
    select least(greatest(coalesce(max_results, 12), 1), 30) as n
  ),
  limited as (
    select * from ranked where rn <= (select n from lim)
  ),
  hold as (
    select * from ranked
    where username = 'slabhold'
      and not exists (select 1 from limited where limited.id = ranked.id)
  )
  select
    picked.id as user_id,
    picked.username,
    picked.display_name,
    picked.avatar_url,
    picked.accent,
    picked.match_reason as reason,
    picked.match_score as score
  from (
    select * from limited
    union all
    select * from hold
  ) picked
  order by picked.match_score desc, picked.created_at asc, picked.username asc;
$$;

create or replace function public.suggest_collectors(max_results integer default 12)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accent text,
  reason text,
  score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    user_id,
    username,
    display_name,
    avatar_url,
    accent,
    reason,
    score
  from private.suggest_collectors(max_results);
$$;

revoke all on function private.interest_short_name(text) from public, anon, authenticated;
revoke all on function private.team_post_reason(text) from public, anon, authenticated;
revoke all on function private.collector_match_weight(uuid, text, text) from public, anon, authenticated;
revoke all on function private.collector_match_reason(text, text, integer) from public, anon, authenticated;
revoke all on function private.suggest_collectors(integer) from public, anon, authenticated;
grant execute on function private.suggest_collectors(integer) to authenticated;

revoke all on function public.suggest_collectors(integer) from public, anon, authenticated;
grant execute on function public.suggest_collectors(integer) to authenticated;

comment on function public.suggest_collectors(integer) is
  'Follow suggestions ranked by overlap with the caller''s profile_interests. Public cards, visible post text, and hunter want labels only. No private card columns. Bounded by the PostgREST role timeout.';

commit;
