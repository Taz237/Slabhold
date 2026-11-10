-- UNAPPLIED. Needs review before running.
--
-- For QA Guard review only. Do not run it, do not `supabase db push`, and do
-- not apply it with the Supabase CLI. The app works without it: reply hearts
-- stay on the device until this table exists.
--
-- Reply hearts on the account.
--
-- public.likes.post_id references public.posts (id), so a reply (a row in
-- public.comments) cannot be liked there: the foreign key rejects comment ids,
-- and migrate_local_likes drops them. This table holds reply likes instead.
--
-- - Only the viewer reads their own reply likes. Replies show no like count,
--   so nobody else needs these rows.
-- - Insert as yourself, on a reply that exists, when neither of you blocked
--   the other. Delete your own.
-- - Shares the post likes' 300-per-hour bucket (private.like_rate), the same
--   cap the server action checks first.
-- - No notification is written here. notifications.post_id references posts,
--   and reply likes never wrote one, so like notifications are unchanged.

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
    and not private.is_blocked(auth.uid(), private.comment_author(comment_id))
  );

drop policy if exists "Delete own reply likes" on public.comment_likes;
create policy "Delete own reply likes" on public.comment_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);
