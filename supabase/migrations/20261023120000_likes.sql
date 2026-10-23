-- Shared likes. Counts live on posts.like_count. A like notifies the author
-- once per liker; localStorage migration inserts with suppress_notify so those
-- rows do not notify. Clients cannot set that flag: the insert policy requires
-- false, and there is no update policy.

alter table public.posts
  add column if not exists like_count integer not null default 0;

-- Only the table owner (the security definer count trigger) may change the count.
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

  -- Depth 1 is a direct update. The count trigger nests this one, so it may write.
  if new.like_count is distinct from old.like_count
     and pg_catalog.pg_trigger_depth() < 2
     and current_user is distinct from owner then
    new.like_count := old.like_count;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_protect_like_count on public.posts;
create trigger posts_protect_like_count
  before update of like_count on public.posts
  for each row
  execute function private.protect_like_count();

revoke all on function private.protect_like_count() from public, anon, authenticated;

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

    delete from public.notifications
    where actor_id = old.user_id
      and post_id = old.post_id
      and kind = 'like';

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
create policy "Read likes on visible posts" on public.likes
  for select using (
    exists (
      select 1
      from public.posts
      where posts.id = likes.post_id
    )
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

-- Silent import for this browser's old likes. Normal inserts cannot pass
-- suppress_notify, and this function only sets it on rows it inserts.
create or replace function public.migrate_local_likes(post_ids uuid[])
returns table (post_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
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

notify pgrst, 'reload schema';
