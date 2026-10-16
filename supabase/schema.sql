-- Slabhold schema
-- Run this in the Supabase SQL editor after creating a project.
--
-- The app reads these environment variables from `.env.local`:
--   NEXT_PUBLIC_SUPABASE_URL
--   NEXT_PUBLIC_SUPABASE_ANON_KEY
--   TRAWL_API_KEY (server-only; live eBay sold comps via Trawl)
--   SUPABASE_SERVICE_ROLE_KEY (optional; preferred for trawl_sold_cache writes)
-- Restart the dev server after setting them. See the README.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  cover_url text,
  accent text not null default '#7c5cff',
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_url text,
  card jsonb,
  quoted_post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.posts
  add column if not exists quoted_post_id uuid references public.posts (id) on delete set null;

create index if not exists posts_quoted_post_id_idx on public.posts (quoted_post_id);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  player text not null,
  year integer not null,
  "set" text not null,
  grade text not null default '',
  parallel text not null default '',
  paid_price numeric(12, 2) default null,
  estimated_value numeric(12, 2) not null default 0,
  image_url text,
  created_at timestamptz not null default now(),
  card_number text not null default '',
  sport text not null default 'Basketball',
  purchase_date date,
  sell_price numeric(12, 2),
  sell_date date,
  notes text not null default '',
  accent text not null default '#7c5cff',
  is_public boolean not null default false,
  category text not null default 'flipping',
  updated_at timestamptz not null default now()
);

-- Rename columns from an earlier draft of this file, if that draft was already applied.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'author_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'user_id'
  ) then
    alter table public.posts rename column author_id to user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'body'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'content'
  ) then
    alter table public.posts rename column body to content;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'player_name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'player'
  ) then
    alter table public.cards rename column player_name to player;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'set_brand'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'set'
  ) then
    alter table public.cards rename column set_brand to "set";
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'purchase_price'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'paid_price'
  ) then
    alter table public.cards rename column purchase_price to paid_price;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'estimated_sell_price'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'estimated_value'
  ) then
    alter table public.cards rename column estimated_sell_price to estimated_value;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'photo_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'image_url'
  ) then
    alter table public.cards rename column photo_url to image_url;
  end if;
end $$;

alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists accent text not null default '#7c5cff';

alter table public.posts add column if not exists content text not null default '';
alter table public.posts add column if not exists image_url text;
alter table public.posts add column if not exists card jsonb;

alter table public.cards add column if not exists grade text not null default '';
alter table public.cards add column if not exists parallel text not null default '';
alter table public.cards add column if not exists paid_price numeric(12, 2) default null;
alter table public.cards add column if not exists estimated_value numeric(12, 2) not null default 0;
alter table public.cards add column if not exists image_url text;
alter table public.cards add column if not exists card_number text not null default '';
alter table public.cards add column if not exists sport text not null default 'Basketball';
alter table public.cards add column if not exists purchase_date date;
alter table public.cards add column if not exists sell_price numeric(12, 2);
alter table public.cards add column if not exists sell_date date;
alter table public.cards add column if not exists notes text not null default '';
alter table public.cards add column if not exists accent text not null default '#7c5cff';
alter table public.cards add column if not exists is_public boolean not null default false;
alter table public.cards add column if not exists category text not null default 'flipping';
alter table public.cards drop constraint if exists cards_category;
alter table public.cards add constraint cards_category check (category in ('flipping', 'pc'));
alter table public.cards add column if not exists updated_at timestamptz not null default now();

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(btrim(body)) between 1 and 280)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  post_id uuid references public.posts (id) on delete cascade,
  preview text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote')),
  constraint notifications_not_self check (actor_id <> recipient_id)
);

create unique index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists posts_user_id_idx on public.posts (user_id, created_at desc);
create index if not exists posts_card_id_idx on public.posts ((card->>'id'));

create index if not exists cards_user_id_idx on public.cards (user_id);
create index if not exists comments_post_id_idx on public.comments (post_id, created_at);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create unique index if not exists notifications_like_once
  on public.notifications (actor_id, post_id)
  where kind = 'like' and post_id is not null;
create unique index if not exists notifications_follow_once
  on public.notifications (actor_id, recipient_id)
  where kind = 'follow';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  constraint messages_content_len check (char_length(btrim(content)) between 1 and 1000),
  constraint messages_not_self check (sender_id <> receiver_id)
);

create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_receiver_idx on public.messages (receiver_id, created_at desc);

create table if not exists public.reposts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists reposts_post_id_idx on public.reposts (post_id);
create index if not exists reposts_user_created_idx on public.reposts (user_id, created_at desc);

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications
  add constraint notifications_kind
  check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote'));

create unique index if not exists notifications_repost_once
  on public.notifications (actor_id, post_id)
  where kind = 'repost' and post_id is not null;

create unique index if not exists notifications_quote_once
  on public.notifications (actor_id, post_id)
  where kind = 'quote' and post_id is not null;

create unique index if not exists notifications_mention_once
  on public.notifications (actor_id, recipient_id, post_id)
  where kind = 'mention' and post_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
begin
  handle := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.cards enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.reposts enable row level security;

grant select on public.profiles to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
grant select on public.cards to anon, authenticated;
grant insert, update, delete on public.cards to authenticated;
grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;
grant select on public.notifications to anon, authenticated;
grant insert, update, delete on public.notifications to authenticated;
grant select on public.messages to anon, authenticated;
grant insert, update on public.messages to authenticated;
grant select on public.reposts to anon, authenticated;
grant insert, delete on public.reposts to authenticated;

drop policy if exists "Profiles are public" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Follows are public" on public.follows;
drop policy if exists "Follow as yourself" on public.follows;
drop policy if exists "Unfollow as yourself" on public.follows;
create policy "Follows are public" on public.follows for select using (true);
create policy "Follow as yourself" on public.follows for insert with check (auth.uid() = follower_id);
create policy "Unfollow as yourself" on public.follows for delete using (auth.uid() = follower_id);

drop policy if exists "Posts are public" on public.posts;
drop policy if exists "Create own posts" on public.posts;
drop policy if exists "Update own posts" on public.posts;
drop policy if exists "Delete own posts" on public.posts;
create policy "Posts are public" on public.posts for select using (true);
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
create policy "Delete own posts" on public.posts for delete using (auth.uid() = user_id);

drop policy if exists "Users can view own cards" on public.cards;
drop policy if exists "Anyone can view public cards" on public.cards;
drop policy if exists "Users can insert own cards" on public.cards;
drop policy if exists "Users can update own cards" on public.cards;
drop policy if exists "Users can delete own cards" on public.cards;
create policy "Users can view own cards" on public.cards for select using (auth.uid() = user_id);
create policy "Anyone can view public cards" on public.cards for select using (is_public);
create policy "Users can insert own cards" on public.cards for insert with check (auth.uid() = user_id);
create policy "Users can update own cards" on public.cards for update using (auth.uid() = user_id);
create policy "Users can delete own cards" on public.cards for delete using (auth.uid() = user_id);

drop policy if exists "Comments are public" on public.comments;
drop policy if exists "Comment as yourself" on public.comments;
drop policy if exists "Delete own comments" on public.comments;
create policy "Comments are public" on public.comments for select using (true);
create policy "Comment as yourself" on public.comments for insert with check (auth.uid() = user_id);
create policy "Delete own comments" on public.comments for delete using (auth.uid() = user_id);

drop policy if exists "Read related notifications" on public.notifications;
drop policy if exists "Create notifications as yourself" on public.notifications;
drop policy if exists "Mark own notifications read" on public.notifications;
drop policy if exists "Delete notifications you sent" on public.notifications;
create policy "Read related notifications" on public.notifications
  for select using (auth.uid() = recipient_id or auth.uid() = actor_id);
create policy "Create notifications as yourself" on public.notifications
  for insert with check (auth.uid() = actor_id and actor_id <> recipient_id);
create policy "Mark own notifications read" on public.notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create policy "Delete notifications you sent" on public.notifications
  for delete using (auth.uid() = actor_id);

drop policy if exists "Read own messages" on public.messages;
drop policy if exists "Send messages as yourself" on public.messages;
drop policy if exists "Mark received messages read" on public.messages;
create policy "Read own messages" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Send messages as yourself" on public.messages
  for insert with check (auth.uid() = sender_id and sender_id <> receiver_id);
create policy "Mark received messages read" on public.messages
  for update using (auth.uid() = receiver_id) with check (auth.uid() = receiver_id);

drop policy if exists "Reposts are public" on public.reposts;
drop policy if exists "Repost as yourself" on public.reposts;
drop policy if exists "Undo own repost" on public.reposts;
create policy "Reposts are public" on public.reposts for select using (true);
create policy "Repost as yourself" on public.reposts for insert with check (auth.uid() = user_id);
create policy "Undo own repost" on public.reposts for delete using (auth.uid() = user_id);

create or replace function public.protect_message_rows()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.sender_id is distinct from old.sender_id
    or new.receiver_id is distinct from old.receiver_id
    or new.content is distinct from old.content
    or new.created_at is distinct from old.created_at then
    raise exception 'Only the read status of a message can change';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_message_rows on public.messages;
create trigger protect_message_rows
  before update on public.messages
  for each row execute function public.protect_message_rows();

insert into storage.buckets (id, name, public)
values
  ('card-photos', 'card-photos', true),
  ('avatars', 'avatars', true),
  ('covers', 'covers', true),
  ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload card photos" on storage.objects;
drop policy if exists "Public can view card photos" on storage.objects;
drop policy if exists "Users can upload avatars" on storage.objects;
drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Users can upload covers" on storage.objects;
drop policy if exists "Public can view covers" on storage.objects;
drop policy if exists "Users can upload post images" on storage.objects;
drop policy if exists "Public can view post images" on storage.objects;

create policy "Users can upload card photos"
  on storage.objects for insert
  with check (
    bucket_id = 'card-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public can view card photos"
  on storage.objects for select
  using (bucket_id = 'card-photos');

create policy "Users can upload avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload covers"
  on storage.objects for insert
  with check (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public can view covers"
  on storage.objects for select
  using (bucket_id = 'covers');

create policy "Users can upload post images"
  on storage.objects for insert
  with check (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public can view post images"
  on storage.objects for select
  using (bucket_id = 'post-images');

-- Cached Trawl eBay sold comps (shared across users; refreshed by the Next.js API route).
create table if not exists public.trawl_sold_cache (
  cache_key text primary key,
  query text not null,
  player_name text not null,
  year integer not null,
  set_brand text not null,
  results jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists trawl_sold_cache_fetched_at_idx
  on public.trawl_sold_cache (fetched_at desc);

alter table public.trawl_sold_cache enable row level security;

grant select, insert, update on public.trawl_sold_cache to anon, authenticated;

drop policy if exists "Anyone can read trawl sold cache" on public.trawl_sold_cache;
drop policy if exists "Anyone can insert trawl sold cache" on public.trawl_sold_cache;
drop policy if exists "Anyone can update trawl sold cache" on public.trawl_sold_cache;
create policy "Anyone can read trawl sold cache"
  on public.trawl_sold_cache for select using (true);
create policy "Anyone can insert trawl sold cache"
  on public.trawl_sold_cache for insert with check (true);
create policy "Anyone can update trawl sold cache"
  on public.trawl_sold_cache for update using (true) with check (true);

-- Best-effort: live updates for comments and notifications. Ignore if realtime is off.
do $$
begin
  begin
    alter publication supabase_realtime add table public.comments;
  exception when others then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when others then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when others then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.reposts;
  exception when others then
    null;
  end;
end $$;

-- Daily collection value snapshots (service role writes; users read own rows).
create table if not exists public.collection_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_date date not null,
  value numeric not null default 0,
  invested numeric not null default 0,
  profit numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, snapshot_date)
);

create index if not exists collection_snapshots_user_date_idx
  on public.collection_snapshots (user_id, snapshot_date);

alter table public.collection_snapshots enable row level security;

drop policy if exists "Users can read own collection snapshots" on public.collection_snapshots;
create policy "Users can read own collection snapshots"
  on public.collection_snapshots
  for select
  using (auth.uid() = user_id);

revoke all on public.collection_snapshots from anon, authenticated;
grant select on public.collection_snapshots to authenticated;
grant select, insert, update, delete on public.collection_snapshots to service_role;

