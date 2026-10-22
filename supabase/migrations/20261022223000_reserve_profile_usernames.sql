-- Reject reserved profile handles without failing signup.
-- Not applied. Do not run this from supabase db push until it is reviewed.
--
-- handle_new_user still builds a handle from signup metadata, then the email
-- local-part, then strips characters outside [a-z0-9_] and keeps 20.
-- A handle that is still too short raises invalid username, as it does today.
-- Signup calls private.available_profile_username and keeps a generated user_
-- handle when the request is reserved, so account creation still commits.
--
-- profiles_reserve_username runs before insert or update of username.
-- An update that does not change the username returns immediately, so an
-- existing holder keeps that name. A rename onto a reserved name raises
-- unique_violation (23505), except the official updates uuid may newly take
-- a grokbotreview or slabholdupdates variant.
--
-- The uuid below must stay in sync with OFFICIAL_UPDATES_USER_ID
-- in lib/social/official-updates.ts.
-- The reserved array must stay in sync with RESERVED_USERNAMES
-- in lib/social/local-db.ts.
--
-- private is not an exposed API schema. The username helper and trigger are
-- not security definer. Their search_path is empty and relations are
-- schema-qualified. private.suggest_collectors below stays security definer
-- with search_path public, matching the function it replaces.
-- Signed-in profile writes call available_profile_username from the trigger,
-- so authenticated and service_role keep execute on that helper.
--
-- private.suggest_collectors is replaced from 20261022181000 with one change:
-- the official updates profile is excluded by uuid instead of by handle.

begin;

set local lock_timeout = '5s';

create schema if not exists private;

create or replace function private.available_profile_username(
  profile_id pg_catalog.uuid,
  requested text
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  official_id pg_catalog.uuid := '6d31ab97-9162-4296-876d-9e0378872fce';
  reserved text[] := array[
    'grokbotreview',
    'slabholdupdates',
    'slabhold',
    'slabholdapp',
    'slabhold_updates',
    'slabholdteam',
    'slabholdsupport',
    'slabholdofficial',
    'admin',
    'administrator',
    'support',
    'help',
    'moderator',
    'mod',
    'official',
    'staff',
    'team'
  ];
  normalized text := lower(btrim(coalesce(requested, '')));
  stem text := regexp_replace(
    regexp_replace(normalized, '[_.-]', '', 'g'),
    '[0-9]+$',
    ''
  );
  attempt text;
  n integer;
begin
  if profile_id = official_id and stem in ('grokbotreview', 'slabholdupdates') then
    return requested;
  end if;
  if not (normalized = any (reserved))
     and stem not in ('grokbotreview', 'slabholdupdates') then
    return requested;
  end if;

  for n in 0..7 loop
    attempt := left('user_' || substr(md5(profile_id::text || ':' || n::text), 1, 15), 20);
    if not exists (
      select 1
      from public.profiles
      where lower(username) = attempt
        and id is distinct from profile_id
    ) then
      return attempt;
    end if;
  end loop;

  return left('user_' || substr(replace(profile_id::text, '-', ''), 1, 15), 20);
end;
$$;

create or replace function private.enforce_reserved_username()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  replacement text;
begin
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    return new;
  end if;

  replacement := private.available_profile_username(new.id, new.username);
  if tg_op = 'UPDATE' and replacement is distinct from new.username then
    raise exception 'username taken'
      using errcode = '23505';
  end if;
  new.username := replacement;
  return new;
end;
$$;

-- Replaces public.handle_new_user from 20261020104500_profiles_username_format.sql.
-- That file is unchanged. A reserved requested handle becomes a user_ handle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_handle text;
  handle text;
begin
  raw_handle := coalesce(
    nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  );
  handle := left(regexp_replace(lower(raw_handle), '[^a-z0-9_]', '', 'g'), 20);
  if handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid username'
      using errcode = '23514';
  end if;
  handle := private.available_profile_username(new.id, handle);
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    handle,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), handle)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_reserve_username on public.profiles;
create trigger profiles_reserve_username
  before insert or update of username on public.profiles
  for each row
  execute function private.enforce_reserved_username();

revoke all on function private.available_profile_username(pg_catalog.uuid, text) from public, anon, authenticated;
revoke all on function private.enforce_reserved_username() from public, anon, authenticated;

grant execute on function private.available_profile_username(pg_catalog.uuid, text) to authenticated, service_role;

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
          and p.id <> '6d31ab97-9162-4296-876d-9e0378872fce'
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


commit;
