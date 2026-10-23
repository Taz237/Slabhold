-- Shared likes. Counts live on posts.like_count. A like notifies the author
-- once per liker; unlike leaves that notice so a relike cannot send another.
-- localStorage migration inserts with suppress_notify so those rows do not
-- notify. Clients cannot set that flag: the insert policy requires false,
-- and there is no update policy.
--
-- Apply after 20261023000500 (deal log). That migration rewrites
-- "Create notifications as yourself"; this file replaces it again so the
-- gate below is the one that stays.

alter table public.posts
  add column if not exists like_count integer not null default 0;

alter table public.posts drop constraint if exists posts_like_count_nonnegative;
alter table public.posts
  add constraint posts_like_count_nonnegative check (like_count >= 0);

-- Only the table owner (the security definer count trigger) may change the
-- count. A client insert cannot seed a fake total.
create or replace function private.protect_like_count()
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
    if tg_op = 'INSERT' then
      new.like_count := 0;
    elsif new.like_count is distinct from old.like_count then
      new.like_count := old.like_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_protect_like_count on public.posts;
create trigger posts_protect_like_count
  before insert or update of like_count on public.posts
  for each row
  execute function private.protect_like_count();

revoke all on function private.protect_like_count() from public, anon, authenticated;

-- A like-count-only update must not re-run Mail Day validation.
drop trigger if exists enforce_mail_day_post on public.posts;
drop trigger if exists enforce_mail_day_post_update on public.posts;
create trigger enforce_mail_day_post
  before insert on public.posts
  for each row
  execute function public.enforce_mail_day_post();
create trigger enforce_mail_day_post_update
  before update on public.posts
  for each row
  when ((to_jsonb(new) - 'like_count') is distinct from (to_jsonb(old) - 'like_count'))
  execute function public.enforce_mail_day_post();

create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  suppress_notify boolean not null default false,
  primary key (post_id, user_id)
);

alter table public.likes
  add column if not exists suppress_notify boolean not null default false;

create index if not exists likes_user_created_idx
  on public.likes (user_id, created_at desc);

-- Direct inserts share the same 300-per-hour cap as the server action.
-- Silent imports set suppress_notify and use their own one-shot quota.
create table if not exists private.like_rate (
  user_id uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, window_start)
);

alter table private.like_rate enable row level security;
revoke all on table private.like_rate from public, anon, authenticated;

create or replace function private.enforce_like_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket timestamptz;
  used_hits integer;
begin
  if new.suppress_notify then
    return new;
  end if;

  bucket := to_timestamp(floor(extract(epoch from pg_catalog.now()) / 3600) * 3600);

  insert into private.like_rate as rate (user_id, window_start, hits)
  values (new.user_id, bucket, 1)
  on conflict (user_id, window_start) do update
  set hits = rate.hits + 1
  returning rate.hits into used_hits;

  if used_hits > 300 then
    raise exception 'You''re liking posts too quickly. Please wait a bit and try again.'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists likes_enforce_rate on public.likes;
create trigger likes_enforce_rate
  before insert on public.likes
  for each row
  execute function private.enforce_like_rate();

revoke all on function private.enforce_like_rate() from public, anon, authenticated;

create or replace function private.sync_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  body text;
  preview text;
begin
  if tg_op = 'INSERT' then
    update public.posts
    set like_count = public.posts.like_count + 1
    where public.posts.id = new.post_id;

    if new.suppress_notify then
      return new;
    end if;

    select p.user_id, p.content
    into author, body
    from public.posts p
    where p.id = new.post_id;

    if author is null or author = new.user_id then
      return new;
    end if;

    if private.is_blocked(new.user_id, author) then
      return new;
    end if;

    preview := nullif(pg_catalog.btrim(coalesce(body, '')), '');
    if preview is not null and pg_catalog.char_length(preview) > 80 then
      preview := pg_catalog.left(preview, 77) || '…';
    end if;

    begin
      insert into public.notifications (recipient_id, actor_id, kind, post_id, preview)
      values (author, new.user_id, 'like', new.post_id, preview);
    exception
      when unique_violation then
        null;
    end;

    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.posts
    set like_count = greatest(public.posts.like_count - 1, 0)
    where public.posts.id = old.post_id;

    -- The like notice stays. notifications_like_once then rejects a relike,
    -- so unliking and liking again does not send another notification.
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists likes_after_insert on public.likes;
create trigger likes_after_insert
  after insert on public.likes
  for each row
  execute function private.sync_like();

drop trigger if exists likes_after_delete on public.likes;
create trigger likes_after_delete
  after delete on public.likes
  for each row
  execute function private.sync_like();

revoke all on function private.sync_like() from public, anon, authenticated;

alter table public.likes enable row level security;

revoke all on table public.likes from public, anon, authenticated;
grant select on table public.likes to anon, authenticated;
grant insert, delete on table public.likes to authenticated;

drop policy if exists "Read likes on visible posts" on public.likes;
create policy "Read likes on visible posts"
  on public.likes
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.posts p where p.id = likes.post_id)
    and not private.is_blocked(auth.uid(), user_id)
  );

drop policy if exists "Insert own likes" on public.likes;
create policy "Insert own likes" on public.likes
  for insert with check (
    auth.uid() = user_id
    and suppress_notify = false
    and not private.is_blocked(auth.uid(), private.post_author(post_id))
    and exists (
      select 1
      from public.posts
      where posts.id = post_id
    )
  );

drop policy if exists "Delete own likes" on public.likes;
create policy "Delete own likes" on public.likes
  for delete using (auth.uid() = user_id);

-- One import window per account: 20 batches, only during the hour after the
-- first call. That copies a device's likes without leaving the RPC open as a
-- way to silently like every visible post.
create table if not exists private.like_import (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calls integer not null,
  started_at timestamptz not null
);

alter table private.like_import enable row level security;
revoke all on table private.like_import from public, anon, authenticated;

create or replace function public.migrate_local_likes(post_ids uuid[])
returns table (post_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  used_calls integer;
begin
  if me is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;
  if post_ids is null or coalesce(pg_catalog.cardinality(post_ids), 0) = 0 then
    return;
  end if;
  if pg_catalog.cardinality(post_ids) > 100 then
    raise exception 'migrate at most 100 likes at a time'
      using errcode = '22023';
  end if;

  insert into private.like_import as quota (user_id, calls, started_at)
  values (me, 1, pg_catalog.now())
  on conflict (user_id) do update
  set calls = quota.calls + 1
  where quota.started_at > pg_catalog.now() - interval '1 hour'
    and quota.calls < 20
  returning quota.calls into used_calls;

  if used_calls is null then
    raise exception 'likes already imported'
      using errcode = '42501';
  end if;

  return query
  insert into public.likes (post_id, user_id, suppress_notify)
  select distinct p.id, me, true
  from public.posts p
  where p.id = any (post_ids)
    and (
      p.hidden_at is null
      or p.user_id = me
    )
    and not private.is_blocked(me, p.user_id)
  on conflict (post_id, user_id) do nothing
  returning public.likes.post_id;
end;
$$;

revoke all on function public.migrate_local_likes(uuid[]) from public, anon, authenticated;
grant execute on function public.migrate_local_likes(uuid[]) to authenticated;

-- Like notices are written only by private.sync_like. A client insert must
-- match a real row the actor just wrote: a follow, a repost, a recent
-- comment that does not already have a notice, or a real @mention.
-- Comment and repost previews are copied from that row, not from the client.
create or replace function private.notification_insert_allowed(
  kind text,
  post_id uuid,
  recipient_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  handle text;
begin
  if me is null or recipient_id is null or me = recipient_id then
    return false;
  end if;

  if kind in ('like', 'quote', 'want_alert', 'deal_confirm') then
    return false;
  end if;

  if kind = 'follow' then
    return post_id is null
      and exists (
        select 1 from public.follows f
        where f.follower_id = me
          and f.following_id = notification_insert_allowed.recipient_id
      );
  end if;

  if kind = 'repost' then
    return post_id is not null
      and recipient_id = private.post_author(post_id)
      and exists (
        select 1 from public.reposts r
        where r.user_id = me
          and r.post_id = notification_insert_allowed.post_id
      );
  end if;

  if kind = 'comment' then
    return post_id is not null
      and recipient_id = private.post_author(post_id)
      and exists (
        select 1
        from public.comments c
        where c.post_id = notification_insert_allowed.post_id
          and c.user_id = me
          and c.created_at > pg_catalog.now() - interval '10 minutes'
      )
      and (
        select count(*)
        from public.notifications n
        where n.actor_id = me
          and n.kind = 'comment'
          and n.post_id = notification_insert_allowed.post_id
      ) < (
        select count(*)
        from public.comments c
        where c.post_id = notification_insert_allowed.post_id
          and c.user_id = me
      );
  end if;

  if kind = 'mention' then
    if post_id is null then
      return false;
    end if;

    select p.username
    into handle
    from public.profiles p
    where p.id = recipient_id;

    if handle is null or handle !~ '^[a-z0-9_]{3,20}$' then
      return false;
    end if;

    return exists (
      select 1
      from public.posts p
      where p.id = post_id
        and p.user_id = me
        and p.content ~* ('(^|[^a-z0-9_])@' || handle || '([^a-z0-9_]|$)')
    )
    or exists (
      select 1
      from public.comments c
      where c.post_id = notification_insert_allowed.post_id
        and c.user_id = me
        and c.body ~* ('(^|[^a-z0-9_])@' || handle || '([^a-z0-9_]|$)')
    );
  end if;

  return false;
end;
$$;

revoke all on function private.notification_insert_allowed(text, uuid, uuid) from public, anon, authenticated;
grant execute on function private.notification_insert_allowed(text, uuid, uuid) to authenticated;

create or replace function private.stamp_notification_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  body text;
  preview text;
begin
  if new.kind = 'comment' then
    select c.body
    into body
    from public.comments c
    where c.post_id = new.post_id
      and c.user_id = new.actor_id
    order by c.created_at desc
    limit 1;
  elsif new.kind = 'repost' then
    select p.content
    into body
    from public.posts p
    where p.id = new.post_id;
  else
    return new;
  end if;

  preview := nullif(pg_catalog.btrim(coalesce(body, '')), '');
  if preview is not null and pg_catalog.char_length(preview) > 80 then
    preview := pg_catalog.left(preview, 77) || '…';
  end if;
  new.preview := preview;
  return new;
end;
$$;

drop trigger if exists notifications_stamp_preview on public.notifications;
create trigger notifications_stamp_preview
  before insert on public.notifications
  for each row
  execute function private.stamp_notification_preview();

revoke all on function private.stamp_notification_preview() from public, anon, authenticated;

alter table public.notifications enable row level security;

drop policy if exists "Create notifications as yourself" on public.notifications;
create policy "Create notifications as yourself"
  on public.notifications
  for insert
  with check (
    auth.uid() = actor_id
    and not private.is_blocked(auth.uid(), recipient_id)
    and private.notification_insert_allowed(kind, post_id, recipient_id)
    and href is null
    and (metadata is null or (kind = 'mention' and metadata = '{"source":"reply"}'::jsonb))
    and (kind <> 'follow' or preview is null)
  );

notify pgrst, 'reload schema';
