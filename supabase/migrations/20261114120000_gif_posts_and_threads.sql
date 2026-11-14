-- UNAPPLIED. Needs review before running.
-- Do not run supabase db push. Do not apply this with the Supabase CLI.
--
-- GIF posts and threads.
--
-- 1. GIFs. posts.gif and comments.gif hold one GIPHY GIF: its id, an mp4 URL,
--    a still URL, a width, a height and an optional title. A check constraint
--    only accepts URLs on GIPHY's media hosts, so a client cannot store a link
--    to anywhere else. A reply may now be a GIF with no text.
--
-- 2. Threads. posts.thread_id groups the posts of one thread and
--    posts.thread_position orders them, 0 first, up to 10 posts.
--    - A thread is written in one insert, by one account, with positions
--      0..n-1 and at least two posts. Anything else is rejected.
--    - thread_id and thread_position cannot be changed by a client afterwards.
--    - Deleting one post leaves the others: later posts move up one place.
--      When a single post is left it becomes a normal post again.
--
-- RLS: no policy is added or changed. The new columns sit on public.posts and
-- public.comments, so the existing policies on those tables cover them: the
-- same people can read them, and only the author can write them.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- GIFs
-- ---------------------------------------------------------------------------

create or replace function private.giphy_url_ok(url text, kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    url is not null
    and pg_catalog.char_length(url) <= 600
    and url !~ '\.\.'
    and url ~ (
      '^https://(media[0-9]?|i)\.giphy\.com/[A-Za-z0-9_./-]+\.'
      || case when kind = 'mp4' then 'mp4' else '(gif|jpg|png|webp)' end
      || '(\?[A-Za-z0-9_.=&%-]*)?$'
    ),
    false
  );
$$;

create or replace function private.gif_ok(gif jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select gif is null or coalesce(
    pg_catalog.jsonb_typeof(gif) = 'object'
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(gif) as k(name)
      where k.name not in ('id', 'mp4', 'still', 'width', 'height', 'title')
    )
    and pg_catalog.jsonb_typeof(gif -> 'id') = 'string'
    and (gif ->> 'id') ~ '^[A-Za-z0-9]{1,64}$'
    and pg_catalog.jsonb_typeof(gif -> 'mp4') = 'string'
    and private.giphy_url_ok(gif ->> 'mp4', 'mp4')
    and pg_catalog.jsonb_typeof(gif -> 'still') = 'string'
    and private.giphy_url_ok(gif ->> 'still', 'still')
    and pg_catalog.jsonb_typeof(gif -> 'width') = 'number'
    and (gif ->> 'width')::numeric between 1 and 4096
    and pg_catalog.jsonb_typeof(gif -> 'height') = 'number'
    and (gif ->> 'height')::numeric between 1 and 4096
    and (
      not (gif ? 'title')
      or (
        pg_catalog.jsonb_typeof(gif -> 'title') = 'string'
        and pg_catalog.char_length(gif ->> 'title') <= 200
      )
    ),
    false
  );
$$;

grant execute on function private.giphy_url_ok(text, text) to anon, authenticated, service_role;
grant execute on function private.gif_ok(jsonb) to anon, authenticated, service_role;

alter table public.posts add column if not exists gif jsonb;
alter table public.posts drop constraint if exists posts_gif_ok;
alter table public.posts add constraint posts_gif_ok check (private.gif_ok(gif));

alter table public.comments add column if not exists gif jsonb;
alter table public.comments drop constraint if exists comments_gif_ok;
alter table public.comments add constraint comments_gif_ok check (private.gif_ok(gif));

-- Same rule as before, plus: a GIF counts the way a photo does.
alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments
  add constraint comments_body_len
  check (
    char_length(btrim(body, E' \t\r\n')) <= 280
    and (
      char_length(btrim(body, E' \t\r\n')) >= 1
      or cardinality(image_urls) between 1 and 4
      or gif is not null
    )
  );

-- ---------------------------------------------------------------------------
-- Threads
-- ---------------------------------------------------------------------------

alter table public.posts add column if not exists thread_id uuid;
alter table public.posts add column if not exists thread_position smallint;

alter table public.posts drop constraint if exists posts_thread_pair;
alter table public.posts
  add constraint posts_thread_pair
  check ((thread_id is null) = (thread_position is null));

alter table public.posts drop constraint if exists posts_thread_position_range;
alter table public.posts
  add constraint posts_thread_position_range
  check (thread_position is null or thread_position between 0 and 9);

-- One post per place in a thread. Deferrable, so moving later posts up one
-- place in a single update is checked once the whole update is done. This is
-- also the index that reads a thread in order.
alter table public.posts drop constraint if exists posts_thread_slot;
alter table public.posts
  add constraint posts_thread_slot
  unique (thread_id, thread_position) deferrable initially immediate;

-- After an insert: every thread it touched is one account's, has 2 to 10
-- posts, and its positions run 0..n-1 with no gap.
create or replace function private.check_new_threads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.posts p
    where p.thread_id in (select i.thread_id from inserted i where i.thread_id is not null)
    group by p.thread_id
    having pg_catalog.count(*) < 2
        or pg_catalog.count(*) > 10
        or pg_catalog.count(distinct p.user_id) <> 1
        or pg_catalog.min(p.thread_position) <> 0
        or pg_catalog.max(p.thread_position) <> pg_catalog.count(*) - 1
  ) then
    raise exception 'A thread is 2 to 10 posts from one account, in order'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

revoke all on function private.check_new_threads() from public, anon, authenticated;

drop trigger if exists posts_check_new_threads on public.posts;
create trigger posts_check_new_threads
  after insert on public.posts
  referencing new table as inserted
  for each statement
  execute function private.check_new_threads();

-- Only the table owner (the delete trigger below) may move a post within a
-- thread. A client update keeps the stored values.
create or replace function private.protect_thread_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner name;
begin
  select pg_catalog.pg_get_userbyid(c.relowner)
  into owner
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'posts';

  if current_user is distinct from owner then
    new.thread_id := old.thread_id;
    new.thread_position := old.thread_position;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_thread_fields() from public, anon, authenticated;

drop trigger if exists posts_protect_thread_fields on public.posts;
create trigger posts_protect_thread_fields
  before update of thread_id, thread_position on public.posts
  for each row
  execute function private.protect_thread_fields();

-- Deleting one post leaves the rest of the thread. Later posts move up one
-- place, and a thread with one post left is a normal post again.
create or replace function private.close_thread_gap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.thread_id is null then
    return null;
  end if;

  update public.posts
  set thread_position = thread_position - 1
  where thread_id = old.thread_id
    and thread_position > old.thread_position;

  update public.posts
  set thread_id = null,
      thread_position = null
  where thread_id = old.thread_id
    and (select pg_catalog.count(*) from public.posts p where p.thread_id = old.thread_id) = 1;

  return null;
end;
$$;

revoke all on function private.close_thread_gap() from public, anon, authenticated;

drop trigger if exists posts_close_thread_gap on public.posts;
create trigger posts_close_thread_gap
  after delete on public.posts
  for each row
  execute function private.close_thread_gap();

commit;

-- Lets the API see the new columns without a restart.
notify pgrst, 'reload schema';
