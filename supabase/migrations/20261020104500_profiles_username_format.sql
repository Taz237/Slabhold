-- Usernames use the same rule as signup and profile edit:
-- 3–20 characters of lowercase letters, numbers, and underscores.
-- Existing profiles were checked before this migration; none broke the rule.
-- This does not rename anyone.

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,20}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
  -- Drop anything outside the rule, then reject a handle that is still too short.
  handle := left(regexp_replace(lower(raw_handle), '[^a-z0-9_]', '', 'g'), 20);
  if handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid username'
      using errcode = '23514';
  end if;
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
