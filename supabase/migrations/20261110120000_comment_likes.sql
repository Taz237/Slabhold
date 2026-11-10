-- ALREADY APPLIED to prod on 2026-11-10 (recorded as migration 20261110112746 comment_likes).
-- Do not run this file again, do not `supabase db push`, and do not apply it with the Supabase CLI.
-- This is the QA Guard–fixed version (lock_timeout, plus an insert policy that requires the parent post to be visible).
--
-- Reply hearts on the account. public.likes.post_id references public.posts, so replies
-- (rows in public.comments) can't be liked there. This table holds reply likes instead.
-- Only the viewer reads their own reply likes. Shares private.like_rate (300 per hour).
-- No notifications are written.

begin;
-- QA FIX 1
set local lock_timeout = '5s';

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_user_created_idx
  on public.comment_likes (user_id, created_at desc);

create or replace function private.comment_author(comment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id from public.comments c where c.id = comment_id;
$$;

revoke all on function private.comment_author(uuid) from public, anon;
grant execute on function private.comment_author(uuid) to authenticated;

create or replace function private.enforce_comment_like_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket timestamptz;
  used_hits integer;
begin
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

drop trigger if exists comment_likes_enforce_rate on public.comment_likes;
create trigger comment_likes_enforce_rate
  before insert on public.comment_likes
  for each row
  execute function private.enforce_comment_like_rate();

revoke all on function private.enforce_comment_like_rate() from public, anon, authenticated;

alter table public.comment_likes enable row level security;

revoke all on table public.comment_likes from public, anon, authenticated;
grant select, insert, delete on table public.comment_likes to authenticated;

drop policy if exists "Read own reply likes" on public.comment_likes;
create policy "Read own reply likes" on public.comment_likes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Like replies as yourself" on public.comment_likes;
create policy "Like replies as yourself" on public.comment_likes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.comments c where c.id = comment_id)
    -- QA FIX 2: parent post must be visible to the liker (posts RLS: hidden_at / blocks)
    and exists (
      select 1 from public.comments c join public.posts p on p.id = c.post_id
      where c.id = comment_likes.comment_id
    )
    and not private.is_blocked(auth.uid(), private.comment_author(comment_id))
  );

drop policy if exists "Delete own reply likes" on public.comment_likes;
create policy "Delete own reply likes" on public.comment_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;
