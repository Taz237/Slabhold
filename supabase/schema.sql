-- Slabhold schema
-- Run ONCE on a NEW empty database, then apply supabase/migrations in order. Never re-run on an existing database.
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

alter table public.cards
  add column if not exists open_to_offers boolean;

update public.cards
set open_to_offers = false
where open_to_offers is null;

alter table public.cards
  alter column open_to_offers set default false;

alter table public.cards
  alter column open_to_offers set not null;

comment on column public.cards.open_to_offers is
  'Owner will hear offers in DMs. False by default. Readable by others only while the card is public.';

-- A private card cannot stay open to offers. The trigger clears the flag
-- before the check, so making a card private still succeeds.
create or replace function public.clear_open_to_offers_when_private()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_public is distinct from true then
    new.open_to_offers := false;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_open_to_offers_when_private() from public, anon, authenticated;

drop trigger if exists cards_clear_open_to_offers_when_private on public.cards;
create trigger cards_clear_open_to_offers_when_private
  before insert or update of is_public, open_to_offers on public.cards
  for each row
  execute function public.clear_open_to_offers_when_private();

alter table public.cards drop constraint if exists cards_open_to_offers_requires_public;
alter table public.cards
  add constraint cards_open_to_offers_requires_public
  check (open_to_offers = false or is_public is true);

-- Columns selected by the production public_cards view. Migrations add the
-- same columns with IF NOT EXISTS.
alter table public.cards add column if not exists no_number boolean not null default false;
alter table public.cards add column if not exists year_label text;
alter table public.cards add column if not exists set_name text;
alter table public.cards add column if not exists set_is_custom boolean not null default false;
alter table public.cards add column if not exists parallel_is_custom boolean not null default false;
alter table public.cards add column if not exists serial_run integer;
alter table public.cards add column if not exists serial_no integer;
alter table public.cards add column if not exists is_rookie boolean not null default false;
alter table public.cards add column if not exists is_auto boolean not null default false;
alter table public.cards add column if not exists is_relic boolean not null default false;
alter table public.cards add column if not exists condition_type text not null default 'raw';
alter table public.cards add column if not exists grader text;
alter table public.cards add column if not exists grade_qualifier text;

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
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  post_id uuid references public.posts (id) on delete set null,
  href text,
  preview text,
  metadata jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert')),
  check (actor_id is null or actor_id <> recipient_id)
);

create unique index if not exists profiles_username_idx on public.profiles (lower(username));

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,20}$');

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
  constraint messages_not_self check (sender_id <> receiver_id)
);

create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_receiver_idx on public.messages (receiver_id, created_at desc);

-- Card preview on an existing DM. Text messages stay unchanged.
alter table public.messages
  add column if not exists kind text;

update public.messages
set kind = 'text'
where kind is null;

alter table public.messages
  alter column kind set default 'text';

alter table public.messages
  alter column kind set not null;

alter table public.messages
  add column if not exists card_preview jsonb;

alter table public.messages drop constraint if exists messages_kind;
alter table public.messages
  add constraint messages_kind
  check (kind in ('text', 'card_preview'));

alter table public.messages drop constraint if exists messages_content_len;
alter table public.messages
  add constraint messages_content_len
  check (
    (
      kind = 'card_preview'
      and char_length(content) <= 1000
    )
    or (
      kind = 'text'
      and char_length(btrim(content)) between 1 and 1000
    )
  );

-- cardId-only shape rule: one key, a uuid string, and a small payload.
alter table public.messages drop constraint if exists messages_card_preview_shape;
alter table public.messages
  add constraint messages_card_preview_shape
  check (
    (
      kind = 'text'
      and card_preview is null
    )
    or (
      kind = 'card_preview'
      and jsonb_typeof(card_preview) = 'object'
      and card_preview = jsonb_build_object('cardId', card_preview->>'cardId')
      and (card_preview->>'cardId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and pg_column_size(card_preview) <= 256
    )
  );

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
  check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert'));

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.notify_quote_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  original_author uuid;
  preview text;
begin
  if new.quoted_post_id is null then
    return new;
  end if;

  select user_id into original_author
  from public.posts
  where id = new.quoted_post_id;

  if original_author is null or original_author = new.user_id then
    return new;
  end if;

  preview := nullif(btrim(coalesce(new.content, '')), '');
  if preview is not null and char_length(preview) > 80 then
    preview := left(preview, 77) || '…';
  end if;
  if preview is null then
    preview := 'Quoted your post';
  end if;

  begin
    insert into public.notifications (recipient_id, actor_id, kind, post_id, preview)
    values (original_author, new.user_id, 'quote', new.id, preview);
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists on_post_quote_notify on public.posts;
create trigger on_post_quote_notify
  after insert on public.posts
  for each row
  execute function public.notify_quote_on_post();

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
create policy "Create own posts" on public.posts
  for insert with check (auth.uid() = user_id);
create policy "Update own posts" on public.posts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Delete own posts" on public.posts for delete using (auth.uid() = user_id);

drop policy if exists "Users can view own cards" on public.cards;
drop policy if exists "Anyone can view public cards" on public.cards;
drop policy if exists "Users can insert own cards" on public.cards;
drop policy if exists "Users can update own cards" on public.cards;
drop policy if exists "Users can delete own cards" on public.cards;
create policy "Users can view own cards" on public.cards for select using (auth.uid() = user_id);
create policy "Anyone can view public cards" on public.cards for select using (is_public);
create policy "Users can insert own cards" on public.cards for insert with check (auth.uid() = user_id);
create policy "Users can update own cards"
  on public.cards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Users can delete own cards" on public.cards for delete using (auth.uid() = user_id);

-- Comment policies match the latest migration (private.is_blocked / private.post_author).
-- The helpers are created here so this file can run on an empty database.
-- supabase/migrations replaces them; public.blocks arrives in those migrations.
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from a
     and auth.uid() is distinct from b then
    raise exception 'permission denied for function is_blocked'
      using errcode = '42501';
  end if;

  return a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
end;
$$;

create or replace function private.is_muted(viewer uuid, author uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from viewer
     and auth.uid() is distinct from author then
    raise exception 'permission denied for function is_muted'
      using errcode = '42501';
  end if;

  return viewer is not null
    and author is not null
    and viewer <> author
    and exists (
      select 1
      from public.mutes
      where muter_id = viewer
        and muted_id = author
    );
end;
$$;

create or replace function private.post_author(post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.posts where id = post_id;
$$;

revoke all on function private.is_blocked(uuid, uuid) from public;
revoke all on function private.is_muted(uuid, uuid) from public;
revoke all on function private.post_author(uuid) from public;
grant execute on function private.is_blocked(uuid, uuid) to anon, authenticated;
grant execute on function private.is_muted(uuid, uuid) to anon, authenticated;
grant execute on function private.post_author(uuid) to authenticated;

drop policy if exists "Comments are public" on public.comments;
drop policy if exists "Comment as yourself" on public.comments;
drop policy if exists "Delete own comments" on public.comments;
create policy "Comments are public" on public.comments
  for select using (not private.is_blocked(auth.uid(), user_id));
create policy "Comment as yourself" on public.comments
  for insert with check (
    auth.uid() = user_id
    and not private.is_blocked(auth.uid(), private.post_author(post_id))
  );
create policy "Delete own comments" on public.comments for delete using (auth.uid() = user_id);

drop policy if exists "Read related notifications" on public.notifications;
drop policy if exists "Create notifications as yourself" on public.notifications;
drop policy if exists "Mark own notifications read" on public.notifications;
drop policy if exists "Delete notifications you sent" on public.notifications;
create policy "Read related notifications" on public.notifications
  for select using (auth.uid() = recipient_id or auth.uid() = actor_id);
create policy "Create notifications as yourself" on public.notifications
  for insert with check (
    auth.uid() = actor_id
    and actor_id <> recipient_id
    and kind <> 'quote'
    and kind <> 'want_alert'
  );
create policy "Mark own notifications read" on public.notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create policy "Delete notifications you sent" on public.notifications
  for delete using (auth.uid() = actor_id);

drop policy if exists "Read own messages" on public.messages;
drop policy if exists "Send messages as yourself" on public.messages;
drop policy if exists "Mark received messages read" on public.messages;
create policy "Read own messages" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Production public_cards and "Send messages as yourself" are in
-- supabase/migrations/20261022180000_open_to_offers.sql.
-- Creating that view here fails the later replay: 20261016230000 replaces
-- public_cards with fewer columns ("cannot drop columns from view").
-- The block below is a reference copy, not executed.
/*
create or replace view public.public_cards
with (security_invoker = false) as
select
  id,
  user_id,
  player,
  year,
  "set",
  grade,
  parallel,
  estimated_value,
  image_url,
  card_number,
  sport,
  accent,
  is_public,
  category,
  created_at,
  updated_at,
  no_number,
  year_label,
  set_name,
  set_is_custom,
  parallel_is_custom,
  serial_run,
  serial_no,
  is_rookie,
  is_auto,
  is_relic,
  condition_type,
  grader,
  grade_qualifier,
  open_to_offers
from public.cards
where is_public = true;

revoke insert, update, delete, truncate, references, trigger
  on public.public_cards from anon, authenticated, public;
grant select on public.public_cards to anon, authenticated;

comment on view public.public_cards is
  'Public card fields only, including open_to_offers. Sensitive columns stay omitted. Private cards are not in this view.';

-- Text DMs keep the existing block rule. A card preview must also be a public
-- open-to-offers card owned by the recipient, and neither person has muted
-- the other. You still cannot message yourself.
create policy "Send messages as yourself" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and not private.is_blocked(auth.uid(), receiver_id)
    and (
      kind = 'text'
      or (
        kind = 'card_preview'
        and not private.is_muted(auth.uid(), receiver_id)
        and not private.is_muted(receiver_id, auth.uid())
        and exists (
          select 1
          from public.public_cards pc
          where pc.user_id = receiver_id
            and pc.open_to_offers is true
            and pc.id::text = card_preview->>'cardId'
        )
      )
    )
  );
*/
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
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.sender_id is distinct from old.sender_id
    or new.receiver_id is distinct from old.receiver_id
    or new.content is distinct from old.content
    or new.created_at is distinct from old.created_at
    or new.kind is distinct from old.kind
    or new.card_preview is distinct from old.card_preview then
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
drop policy if exists "Users can delete own card photos" on storage.objects;
drop policy if exists "Users can view own card photos" on storage.objects;

create policy "Users can upload card photos"
  on storage.objects for insert
  with check (
    bucket_id = 'card-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own card photos"
  on storage.objects for delete
  using (
    bucket_id = 'card-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own card photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'card-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can upload avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can upload covers"
  on storage.objects for insert
  with check (
    bucket_id = 'covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can upload post images"
  on storage.objects for insert
  with check (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

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

-- Created by supabase/migrations/20261016260000_collection_snapshots.sql.
-- That migration has no drop policy if exists, so this copy is not executed.
/*
create policy "Users can read own collection snapshots"
  on public.collection_snapshots
  for select
  using (auth.uid() = user_id);
*/

revoke all on public.collection_snapshots from anon, authenticated;
grant select on public.collection_snapshots to authenticated;
grant select, insert, update, delete on public.collection_snapshots to service_role;

-- Profile pin. Also applied by supabase/migrations/20261023003000_profile_pinned_post.sql.
-- A hidden post cannot be pinned. Hiding a post clears that pin.
alter table public.posts
  add column if not exists hidden_at timestamptz;

alter table public.profiles
  add column if not exists pinned_post_id uuid;

alter table public.profiles
  drop constraint if exists profiles_pinned_post_id_fkey;

alter table public.profiles
  add constraint profiles_pinned_post_id_fkey
  foreign key (pinned_post_id)
  references public.posts (id)
  on delete set null;

comment on column public.profiles.pinned_post_id is
  'The one post this profile pins. Null when nothing is pinned. Must be a visible post whose user_id is this profile. Cleared when that post is deleted or hidden.';

create index if not exists profiles_pinned_post_id_idx
  on public.profiles (pinned_post_id);

create or replace function private.enforce_own_pinned_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.pinned_post_id is not distinct from old.pinned_post_id then
    return new;
  end if;
  if new.pinned_post_id is null then
    return new;
  end if;
  -- Share lock so a moderator hide waits, then clears this pin, instead of
  -- committing a hidden post that this transaction already decided to pin.
  perform 1
  from public.posts
  where public.posts.id = new.pinned_post_id
    and public.posts.user_id = new.id
    and public.posts.hidden_at is null
  for share;
  if not found then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_own_pinned_post() from public, anon, authenticated;

drop trigger if exists profiles_enforce_own_pin on public.profiles;
create trigger profiles_enforce_own_pin
  before insert or update of pinned_post_id on public.profiles
  for each row
  execute function private.enforce_own_pinned_post();

create or replace function public.pin_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null or post_id is null then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.posts
    where public.posts.id = post_id
      and public.posts.user_id = uid
      and public.posts.hidden_at is null
  ) then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  update public.profiles
  set pinned_post_id = post_id
  where public.profiles.id = uid;
  if not found then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.unpin_post()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  update public.profiles
  set pinned_post_id = null
  where public.profiles.id = uid;
end;
$$;

revoke all on function public.pin_post(uuid) from public, anon, authenticated;
revoke all on function public.unpin_post() from public, anon, authenticated;
grant execute on function public.pin_post(uuid) to authenticated;
grant execute on function public.unpin_post() to authenticated;

comment on function public.pin_post(uuid) is
  'Pin one of your own posts. Replaces the previous pin. anon cannot execute this.';
comment on function public.unpin_post() is
  'Clear your pinned post. anon cannot execute this.';

create or replace function private.clear_pin_when_post_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hidden_at is not null then
    update public.profiles
    set pinned_post_id = null
    where public.profiles.pinned_post_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_pin_when_post_hidden() from public, anon, authenticated;

drop trigger if exists posts_clear_pin_when_hidden on public.posts;
create trigger posts_clear_pin_when_hidden
  after update of hidden_at on public.posts
  for each row
  execute function private.clear_pin_when_post_hidden();
-- Value board. Same objects as supabase/migrations/20261023011000_leaderboard_opt_in.sql.
-- Public rows use public held cards only.

alter table public.profiles
  add column if not exists is_test boolean not null default false;

create table if not exists public.card_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.cards (id) on delete set null,
  card_key uuid,
  user_id uuid,
  snapshot_date date not null,
  median numeric,
  n_sales integer,
  self_reported boolean not null default false,
  status text,
  is_public boolean,
  held boolean,
  player text,
  year text,
  set_name text,
  parallel text,
  grade text,
  grader text,
  year_label text,
  card_number text,
  serial_run text,
  is_auto boolean,
  is_relic boolean,
  grade_qualifier text,
  condition_type text,
  query_key text
);

create table if not exists public.comp_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, card_id, item_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Collection leaderboard opt-in and the only public read of card snapshots.
-- The function returns card rows for eligible, opted-in public collections:
-- medians and sale counts the value board needs, a bracket id, and flags.
-- The bracket is the week-start sum of public held cards. Private holdings stay out.
-- The lineup is the week-start public snapshot. Deleted or sold cards stay in it.
-- A card made private mid-week still counts, at its last public trusted value.
-- A snapshot taken while the card was private never reaches the percent.
-- Identity is player, year, year label, set, parallel, grade, grader, card number,
-- serial, auto, relic, qualifier, and condition, plus the comps query key.
-- The end is the latest public trusted snapshot in the week whose identity and
-- query key still match the week-start row, so a loss saved before an edit
-- still counts. The start median is used only when no such row exists.
-- A same-day update that would change identity or query key is skipped.
-- It does not return collection dollar totals, paid prices, notes, or certs.
--
-- Account age uses auth.users.created_at. profiles.created_at is not the gate.
-- Anon can still read leaderboard_opt_in: profiles SELECT is public, and hiding
-- one column would break select * on profiles.
--
-- search_path is empty. Every relation in the body is schema-qualified.
-- Idempotent: column adds, replace, and grants can run again.
-- Do not apply from the app. Ship the file and apply it separately.



alter table public.profiles
  add column if not exists leaderboard_opt_in boolean not null default false;

comment on column public.profiles.leaderboard_opt_in is
  'Owner opt-in for the public collection leaderboard. Off until they turn it on. Turning it off removes them.';

create index if not exists profiles_leaderboard_opt_in_idx
  on public.profiles (id)
  where leaderboard_opt_in;

-- Signed-in users can update profiles.created_at. Keep the original timestamp
-- unless the write is the service role.
create or replace function public.protect_profile_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_created_at on public.profiles;
create trigger protect_profile_created_at
  before update on public.profiles
  for each row execute function public.protect_profile_created_at();

revoke all on function public.protect_profile_created_at() from public, anon, authenticated;

alter table public.card_value_snapshots
  add column if not exists n_sales integer;

alter table public.card_value_snapshots
  add column if not exists self_reported boolean not null default false;

alter table public.card_value_snapshots
  add column if not exists id uuid default gen_random_uuid();

alter table public.card_value_snapshots
  add column if not exists card_key uuid;

alter table public.card_value_snapshots
  add column if not exists user_id uuid;

alter table public.card_value_snapshots
  add column if not exists status text;

alter table public.card_value_snapshots
  add column if not exists is_public boolean;

alter table public.card_value_snapshots
  add column if not exists held boolean;

alter table public.card_value_snapshots
  add column if not exists player text;

alter table public.card_value_snapshots
  add column if not exists year text;

alter table public.card_value_snapshots
  add column if not exists set_name text;

alter table public.card_value_snapshots
  add column if not exists parallel text;

alter table public.card_value_snapshots
  add column if not exists grade text;

alter table public.card_value_snapshots
  add column if not exists grader text;

alter table public.card_value_snapshots
  add column if not exists year_label text;

alter table public.card_value_snapshots
  add column if not exists card_number text;

alter table public.card_value_snapshots
  add column if not exists serial_run text;

alter table public.card_value_snapshots
  add column if not exists is_auto boolean;

alter table public.card_value_snapshots
  add column if not exists is_relic boolean;

alter table public.card_value_snapshots
  add column if not exists grade_qualifier text;

alter table public.card_value_snapshots
  add column if not exists condition_type text;

alter table public.card_value_snapshots
  add column if not exists query_key text;

comment on column public.card_value_snapshots.n_sales is
  'Matched sales behind the median. Null is not a trusted price.';

comment on column public.card_value_snapshots.self_reported is
  'True when a matched sale source was self, owner, or reported.';

comment on column public.card_value_snapshots.card_key is
  'Card id copied at snapshot time. Kept after the card row is deleted.';

comment on column public.card_value_snapshots.held is
  'True when the card was unsold at snapshot time.';

update public.card_value_snapshots
set card_key = card_id
where card_key is null
  and card_id is not null;

update public.card_value_snapshots as snaps
set user_id = cards.user_id
from public.cards as cards
where snaps.user_id is null
  and snaps.card_id = cards.id;

do $$
begin
  if not exists (select 1 from public.card_value_snapshots where card_key is null) then
    alter table public.card_value_snapshots alter column card_key set not null;
  end if;
end $$;

create unique index if not exists card_value_snapshots_card_key_date_idx
  on public.card_value_snapshots (card_key, snapshot_date);

create index if not exists card_value_snapshots_user_date_idx
  on public.card_value_snapshots (user_id, snapshot_date);

-- Keep the pre-PR writer (upsert on conflict (card_id, snapshot_date), no card_key)
-- working between "migration applied" and "new app deployed".
create unique index if not exists card_value_snapshots_card_id_date_idx
  on public.card_value_snapshots (card_id, snapshot_date);

create index if not exists card_value_snapshots_date_idx
  on public.card_value_snapshots (snapshot_date);

create or replace function public.card_value_snapshot_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.card_key := coalesce(new.card_key, new.card_id);
  if new.user_id is null and new.card_id is not null then
    select c.user_id into new.user_id from public.cards c where c.id = new.card_id;
  end if;
  return new;
end;
$$;

drop trigger if exists card_value_snapshot_defaults on public.card_value_snapshots;
create trigger card_value_snapshot_defaults
  before insert on public.card_value_snapshots
  for each row execute function public.card_value_snapshot_defaults();

revoke all on function public.card_value_snapshot_defaults() from public, anon, authenticated;

do $$
declare
  user_fk text;
begin
  select pg_get_constraintdef(con.oid)
    into user_fk
  from pg_constraint con
  where con.conname = 'card_value_snapshots_user_id_fkey'
    and con.conrelid = 'public.card_value_snapshots'::regclass;

  if user_fk is null then
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  elsif user_fk not ilike '%delete cascade%' then
    alter table public.card_value_snapshots drop constraint card_value_snapshots_user_id_fkey;
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- The old primary key includes card_id, so the card cannot be set null until
-- that key is replaced. Match the full definition. "card_id" contains "id".
do $$
declare
  pk_def text;
  fk_def text;
begin
  select pg_get_constraintdef(con.oid)
    into pk_def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'card_value_snapshots'
    and con.contype = 'p';

  if replace(coalesce(pk_def, ''), ' ', '') = 'PRIMARYKEY(card_id,snapshot_date)' then
    alter table public.card_value_snapshots drop constraint card_value_snapshots_pkey;
    alter table public.card_value_snapshots alter column id set not null;
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_pkey primary key (id);
  end if;

  alter table public.card_value_snapshots alter column card_id drop not null;

  select pg_get_constraintdef(con.oid)
    into fk_def
  from pg_constraint con
  where con.conname = 'card_value_snapshots_card_id_fkey'
    and con.conrelid = 'public.card_value_snapshots'::regclass;

  if fk_def is null then
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_card_id_fkey
      foreign key (card_id) references public.cards (id) on delete set null;
  elsif fk_def ilike '%delete cascade%' then
    alter table public.card_value_snapshots drop constraint card_value_snapshots_card_id_fkey;
    alter table public.card_value_snapshots
      add constraint card_value_snapshots_card_id_fkey
      foreign key (card_id) references public.cards (id) on delete set null;
  end if;
end $$;

alter table public.card_value_snapshots enable row level security;

drop policy if exists "Users read own card value snapshots" on public.card_value_snapshots;
create policy "Users read own card value snapshots"
  on public.card_value_snapshots
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.cards
      where cards.id = card_value_snapshots.card_id
        and cards.user_id = auth.uid()
    )
  );

revoke all on public.card_value_snapshots from anon, authenticated;
grant select on public.card_value_snapshots to authenticated;
grant select, insert, update, delete on public.card_value_snapshots to service_role;

create index if not exists comp_flags_card_id_idx
  on public.comp_flags (card_id);

drop function if exists public.card_snapshot_identity(text, text, text, text, text, text);

create or replace function public.card_snapshot_identity(
  p_player text,
  p_year text,
  p_year_label text,
  p_set text,
  p_parallel text,
  p_grade text,
  p_grader text,
  p_card_number text,
  p_serial_run text,
  p_is_auto boolean,
  p_is_relic boolean,
  p_grade_qualifier text,
  p_condition_type text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_player, '')) || '|' ||
         lower(coalesce(p_year, '')) || '|' ||
         lower(coalesce(p_year_label, '')) || '|' ||
         lower(coalesce(p_set, '')) || '|' ||
         lower(coalesce(p_parallel, '')) || '|' ||
         lower(coalesce(p_grade, '')) || '|' ||
         lower(coalesce(p_grader, '')) || '|' ||
         lower(regexp_replace(btrim(coalesce(p_card_number, '')), '^#', '')) || '|' ||
         lower(coalesce(p_serial_run, '')) || '|' ||
         case when coalesce(p_is_auto, false) then '1' else '0' end || '|' ||
         case when coalesce(p_is_relic, false) then '1' else '0' end || '|' ||
         lower(coalesce(p_grade_qualifier, '')) || '|' ||
         lower(coalesce(p_condition_type, ''));
$$;

revoke all on function public.card_snapshot_identity(text, text, text, text, text, text, text, text, text, boolean, boolean, text, text) from public, anon, authenticated;

-- A same-day upsert must not replace today's row when the card's identity or
-- comps query key changed. Returning null keeps the pre-edit snapshot.
create or replace function public.card_value_snapshot_keep_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.card_snapshot_identity(
       new.player, new.year, new.year_label, new.set_name, new.parallel, new.grade, new.grader,
       new.card_number, new.serial_run, new.is_auto, new.is_relic, new.grade_qualifier, new.condition_type
     ) is distinct from public.card_snapshot_identity(
       old.player, old.year, old.year_label, old.set_name, old.parallel, old.grade, old.grader,
       old.card_number, old.serial_run, old.is_auto, old.is_relic, old.grade_qualifier, old.condition_type
     )
     or (
       old.query_key is not null
       and new.query_key is not null
       and old.query_key is distinct from new.query_key
     )
  then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists card_value_snapshot_keep_identity on public.card_value_snapshots;
create trigger card_value_snapshot_keep_identity
  before update on public.card_value_snapshots
  for each row execute function public.card_value_snapshot_keep_identity();

revoke all on function public.card_value_snapshot_keep_identity() from public, anon, authenticated;

drop function if exists public.leaderboard_rows(date, date, integer, numeric);
drop function if exists public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz);

create function public.leaderboard_rows(
  p_start date,
  p_end date,
  p_min_cards integer,
  p_min_value numeric,
  p_min_account_days integer,
  p_as_of timestamptz
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accent text,
  bracket text,
  card_id uuid,
  start_median numeric,
  end_median numeric,
  start_n_sales integer,
  end_n_sales integer,
  self_reported boolean,
  open_flag boolean,
  identity_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  with opted as (
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.accent,
      case
        when pv.value is null then null
        when pv.value < 1000 then 'under-1k'
        when pv.value < 10000 then '1k-10k'
        else '10k-plus'
      end as bracket
    from public.profiles p
    join auth.users u on u.id = p.id
    left join lateral (
      select sum(s.median) as value
      from public.card_value_snapshots s
      where s.user_id = p.id
        and s.snapshot_date = p_start
        and s.is_public is true
        and s.held is true
    ) pv on true
    where p.leaderboard_opt_in is true
      and p_start is not null
      and p_end is not null
      and p_end >= p_start
      and coalesce(p.is_test, false) = false
      and u.created_at <= least(coalesce(p_as_of, now()), now()) - (least(greatest(coalesce(p_min_account_days, 7), 7), 1000000) * interval '1 day')
      and lower(p.username) <> 'qa_vreset_1021'
      and left(lower(p.username), 3) <> 'qa_'
      and left(lower(p.username), 3) <> 'qa-'
      and left(lower(p.username), 5) <> 'test_'
      and left(lower(p.username), 7) <> 'vreset_'
  ),
  lineup as (
    select
      s.user_id,
      s.card_id,
      s.card_key,
      s.median,
      s.n_sales,
      s.self_reported,
      s.player,
      s.query_key,
      public.card_snapshot_identity(
        s.player, s.year, s.year_label, s.set_name, s.parallel, s.grade, s.grader,
        s.card_number, s.serial_run, s.is_auto, s.is_relic, s.grade_qualifier, s.condition_type
      ) as identity_key
    from public.card_value_snapshots s
    where s.snapshot_date = p_start
      and s.card_key is not null
      and s.is_public is true
      and s.held is true
      and s.status in ('ok', 'sample')
      and s.median is not null
      and s.median >= 5
      and s.n_sales >= 2
  ),
  valued as (
    select
      user_id,
      count(*)::integer as valued_cards,
      sum(median) as valued_sum
    from lineup
    group by user_id
  ),
  eligible as (
    select o.*
    from opted o
    join valued v on v.user_id = o.id
    where v.valued_cards >= least(greatest(coalesce(p_min_cards, 10), 10), 1000000)
      and v.valued_sum >= least(greatest(coalesce(p_min_value, 250), 250), 1000000)
  ),
  chosen_end as (
    select distinct on (start_snap.card_key)
      start_snap.card_key,
      start_snap.user_id,
      s.median,
      s.n_sales,
      s.self_reported,
      s.query_key,
      start_snap.identity_key
    from lineup start_snap
    join public.card_value_snapshots s
      on s.card_key = start_snap.card_key
     and s.user_id = start_snap.user_id
     and s.snapshot_date >= p_start
     and s.snapshot_date <= p_end
     and s.is_public is true
     and s.status in ('ok', 'sample')
     and s.median is not null
     and s.median >= 5
     and s.n_sales >= 2
     and public.card_snapshot_identity(
       s.player, s.year, s.year_label, s.set_name, s.parallel, s.grade, s.grader,
       s.card_number, s.serial_run, s.is_auto, s.is_relic, s.grade_qualifier, s.condition_type
     ) = start_snap.identity_key
     and s.query_key is not distinct from start_snap.query_key
    order by start_snap.card_key, s.snapshot_date desc
  )
  select
    e.id,
    e.username,
    e.display_name,
    e.avatar_url,
    e.accent,
    e.bracket,
    start_snap.card_key,
    start_snap.median,
    coalesce(end_snap.median, start_snap.median),
    start_snap.n_sales,
    coalesce(end_snap.n_sales, start_snap.n_sales),
    case
      when end_snap.card_key is null then coalesce(start_snap.self_reported, false)
      else (coalesce(start_snap.self_reported, false) or coalesce(end_snap.self_reported, false))
    end,
    exists (
      select 1
      from public.comp_flags f
      where f.card_id = start_snap.card_id
        and f.user_id is distinct from e.id
        and f.created_at < (p_start + interval '1 day')
    ),
    start_snap.identity_key
  from eligible e
  join lineup start_snap on start_snap.user_id = e.id
  left join chosen_end end_snap
    on end_snap.card_key = start_snap.card_key
   and end_snap.user_id = e.id;
$$;

comment on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) is
  'Eligible opted-in value-board card rows. Bracket comes from the week-start value of public held cards only. Minimums cannot drop below 10 trusted cards, $250, or 7 days.';

revoke all on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.leaderboard_rows(date, date, integer, numeric, integer, timestamptz) to service_role;

-- Block ids for the value board, both directions, for one verified viewer.
-- Service role only: value-load.ts passes the viewer id from auth.getUser().
-- Signed-in users must not be able to list who blocked them.
drop function if exists public.blocked_by_ids();

create or replace function public.leaderboard_hidden_ids(p_viewer uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id from public.blocks b where b.blocker_id = p_viewer
  union
  select b.blocker_id from public.blocks b where b.blocked_id = p_viewer;
$$;

revoke all on function public.leaderboard_hidden_ids(uuid) from public, anon, authenticated;
grant execute on function public.leaderboard_hidden_ids(uuid) to service_role;
