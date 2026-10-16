-- Quote posts (X-style): posts may reference another post via quoted_post_id.

alter table public.posts
  add column if not exists quoted_post_id uuid references public.posts (id) on delete set null;

create index if not exists posts_quoted_post_id_idx on public.posts (quoted_post_id);

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications
  add constraint notifications_kind
  check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote'));

create unique index if not exists notifications_quote_once
  on public.notifications (actor_id, post_id)
  where kind = 'quote' and post_id is not null;

-- Keep existing posts policies; tighten insert/update so quoted_post_id is null
-- or points at a post the author can see (posts are publicly selectable).
drop policy if exists "Create own posts" on public.posts;
create policy "Create own posts" on public.posts for insert with check (
  auth.uid() = user_id
  and (
    quoted_post_id is null
    or exists (
      select 1 from public.posts as original
      where original.id = quoted_post_id
    )
  )
);

drop policy if exists "Update own posts" on public.posts;
create policy "Update own posts" on public.posts for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      quoted_post_id is null
      or exists (
        select 1 from public.posts as original
        where original.id = quoted_post_id
      )
    )
  );
