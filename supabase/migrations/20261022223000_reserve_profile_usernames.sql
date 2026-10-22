-- Reject reserved profile handles without failing signup.
-- Not applied. Do not run this from supabase db push until it is reviewed.
--
-- handle_new_user still builds a handle from signup metadata, then the email
-- local-part, then strips characters outside [a-z0-9_] and keeps 20.
-- A handle that is still too short raises invalid username, as it does today.
-- A reserved handle is not an error: anyone except the official updates uuid
-- gets a generated user_ handle instead, so account creation still commits.
-- The same rewrite runs before a profile username insert or update.
-- On update, a non-reserved current handle is kept instead of being replaced.
--
-- The uuid below must stay in sync with OFFICIAL_UPDATES_USER_ID
-- in lib/social/official-updates.ts.
-- The reserved list must stay in sync with RESERVED_USERNAMES
-- in lib/social/local-db.ts.
--
-- private is not an exposed API schema. The helper and trigger function are
-- not security definer. search_path is empty; relations are schema-qualified.

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
  reserved text[] := array['grokbotreview', 'slabholdupdates'];
  normalized text := lower(btrim(coalesce(requested, '')));
  attempt text;
  n integer;
begin
  if profile_id = official_id then
    return requested;
  end if;
  if not (normalized = any (reserved)) then
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
  kept text;
begin
  replacement := private.available_profile_username(new.id, new.username);
  if tg_op = 'UPDATE'
     and replacement is distinct from new.username
     and old.username is not null
  then
    kept := private.available_profile_username(new.id, old.username);
    if kept is not distinct from old.username then
      new.username := old.username;
      return new;
    end if;
  end if;
  new.username := replacement;
  return new;
end;
$$;

-- Replaces public.handle_new_user from 20261020104500_profiles_username_format.sql.
-- That file is unchanged. A reserved requested handle no longer reaches the insert.
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

commit;
