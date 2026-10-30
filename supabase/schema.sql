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

alter table public.cards
  add column if not exists sold_at timestamptz;

alter table public.cards
  add column if not exists sold_deal_id uuid;

comment on column public.cards.sold_at is
  'Set when a deal is confirmed. The card stays on the owner account and leaves the public collection.';

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  price_cents integer,
  status text not null,
  card_player text not null default '',
  card_year text not null default '',
  card_set text not null default '',
  card_number text not null default '',
  card_parallel text not null default '',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint deals_card_id_fkey foreign key (card_id) references public.cards (id) on delete set null,
  constraint deals_seller_not_buyer check (seller_id <> buyer_id),
  constraint deals_kind check (kind in ('sale', 'trade')),
  constraint deals_price_cents check (
    price_cents is null or (price_cents >= 0 and price_cents <= 100000000)
  ),
  constraint deals_status check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  constraint deals_confirmed_at check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  ),
  constraint deals_pending_has_card check (status <> 'pending' or card_id is not null)
);

create unique index if not exists deals_one_pending_per_card
  on public.deals (card_id)
  where status = 'pending';

create index if not exists deals_seller_idx
  on public.deals (seller_id, created_at desc);

create index if not exists deals_buyer_idx
  on public.deals (buyer_id, created_at desc);

alter table public.cards drop constraint if exists cards_sold_deal_id_fkey;
alter table public.cards
  add constraint cards_sold_deal_id_fkey
  foreign key (sold_deal_id) references public.deals (id) on delete set null;

alter table public.deals enable row level security;

drop policy if exists "Seller or buyer can read deals" on public.deals;
create policy "Seller or buyer can read deals"
  on public.deals
  for select
  to authenticated
  using (auth.uid() = seller_id or auth.uid() = buyer_id);

revoke all on public.deals from anon, authenticated;
grant select on public.deals to authenticated;

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
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint comments_image_urls_len check (cardinality(image_urls) between 0 and 4),
  constraint comments_body_len check (
    char_length(btrim(body, E' \t\r\n')) <= 280
    and (
      char_length(btrim(body, E' \t\r\n')) >= 1
      or cardinality(image_urls) between 1 and 4
    )
  )
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
  constraint notifications_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert', 'deal_confirm')),
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
  check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert', 'deal_confirm'));

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

create or replace function private.reply_image_urls_ok(urls text[], owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select urls is not null
    and owner is not null
    and (pg_catalog.array_ndims(urls) is null or pg_catalog.array_ndims(urls) = 1)
    and pg_catalog.cardinality(urls) <= 4
    and pg_catalog.array_position(urls, null) is null
    and not exists (
      select 1 from pg_catalog.unnest(urls) as u(url)
      where u.url !~ ('^https://knuwflptobyutrauxblj\.supabase\.co/storage/v1/object/public/post-images/'
                      || owner::text
                      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
    )
    and (select pg_catalog.count(distinct u.url) from pg_catalog.unnest(urls) as u(url)) = pg_catalog.cardinality(urls);
$$;

grant execute on function private.reply_image_urls_ok(text[], uuid) to anon, authenticated, service_role;

alter table public.comments drop constraint if exists comments_image_urls_ok;
alter table public.comments
  add constraint comments_image_urls_ok
  check (private.reply_image_urls_ok(image_urls, user_id));


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
    and not private.is_blocked(auth.uid(), recipient_id)
    and private.notification_insert_allowed(kind, post_id, recipient_id)
    and href is null
    and (metadata is null or (kind = 'mention' and metadata = '{"source":"reply"}'::jsonb))
    and (kind <> 'follow' or preview is null)
    and kind <> 'quote'
    and kind <> 'want_alert'
    and kind <> 'deal_confirm'
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
where is_public = true
  and sold_at is null;

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


-- Likes. Mirrors supabase/migrations/20261023120000_likes.sql.
alter table public.posts add column if not exists hidden_at timestamptz;
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
-- schema.sql is applied before migrations, so the function may not exist yet.
do $mail_day_likes$
begin
  if to_regprocedure('public.enforce_mail_day_post()') is null then
    return;
  end if;
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
end
$mail_day_likes$;

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

-- Push notifications. Mirrors supabase/migrations/20261030120000_push_notifications.sql.
-- Subscriptions and prefs are own-only under RLS. The outbox and leases are
-- private, written by triggers, and read only through service_role functions.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0,
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://' and char_length(endpoint) <= 1024),
  constraint push_subscriptions_platform check (platform is null or platform in ('ios', 'android', 'desktop', 'other')),
  constraint push_subscriptions_user_agent_len check (user_agent is null or char_length(user_agent) <= 200)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

drop policy if exists "Read own push subscriptions" on public.push_subscriptions;
create policy "Read own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Delete own push subscriptions" on public.push_subscriptions;
create policy "Delete own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------

create or replace function private.is_valid_time_zone(zone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if zone is null or pg_catalog.char_length(zone) not between 1 and 64 then
    return false;
  end if;
  perform pg_catalog.timezone(zone, pg_catalog.now());
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_time_zone(text) from public, anon, authenticated;
-- The time_zone check runs as the user writing their own row.
grant execute on function private.is_valid_time_zone(text) to authenticated, service_role;

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_follow boolean not null default true,
  push_like boolean not null default true,
  push_reply boolean not null default true,
  push_repost boolean not null default true,
  push_quote boolean not null default true,
  push_mention boolean not null default true,
  push_dm boolean not null default true,
  show_previews boolean not null default true,
  quiet_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  time_zone text not null default 'America/New_York',
  updated_at timestamptz not null default now(),
  constraint notification_prefs_time_zone check (private.is_valid_time_zone(time_zone))
);

alter table public.notification_prefs enable row level security;

revoke all on table public.notification_prefs from public, anon, authenticated;
grant select, insert, update on table public.notification_prefs to authenticated;
grant select, insert, update, delete on table public.notification_prefs to service_role;

drop policy if exists "Read own notification prefs" on public.notification_prefs;
create policy "Read own notification prefs"
  on public.notification_prefs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own notification prefs" on public.notification_prefs;
create policy "Create own notification prefs"
  on public.notification_prefs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own notification prefs" on public.notification_prefs;
create policy "Update own notification prefs"
  on public.notification_prefs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------

create table if not exists private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind text not null,
  post_id uuid,
  -- No foreign keys: an unlike or unfollow deletes the source row, and the
  -- sender reads that as "skip".
  notification_id uuid,
  message_id uuid,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  -- Sent rows: when the push went out. Collapsed rows: when a trailing summary
  -- covered them (null until then).
  sent_at timestamptz,
  attempts integer not null default 0,
  claimed_at timestamptz,
  group_key text not null,
  constraint push_outbox_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'dm')),
  constraint push_outbox_status check (status in ('pending', 'sent', 'collapsed', 'skipped', 'failed'))
);

create index if not exists push_outbox_status_created_idx
  on private.push_outbox (status, created_at);
create index if not exists push_outbox_group_idx
  on private.push_outbox (recipient_id, group_key, created_at);
create index if not exists push_outbox_actor_idx
  on private.push_outbox (actor_id, created_at);

alter table private.push_outbox enable row level security;
revoke all on table private.push_outbox from public, anon, authenticated;

create table if not exists private.push_tail_leases (
  recipient_id uuid not null,
  group_key text not null,
  leased_until timestamptz not null,
  primary key (recipient_id, group_key)
);

alter table private.push_tail_leases enable row level security;
revoke all on table private.push_tail_leases from public, anon, authenticated;

-- Notification tag for a group. Mirrors pushGroupKey in lib/push/group.ts.
create or replace function private.push_group_key(kind text, post_id uuid, actor_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when kind = 'follow' then 'follow'
    when kind = 'dm' then 'dm:' || coalesce(actor_id::text, 'none')
    when kind = 'comment' then 'reply:' || coalesce(post_id::text, 'none')
    else kind || ':' || coalesce(post_id::text, 'none')
  end;
$$;

revoke all on function private.push_group_key(text, uuid, uuid) from public, anon, authenticated;

-- Both triggers only queue a row. A failure here is logged and swallowed so
-- the like, follow, reply or message itself always saves.
create or replace function private.push_outbox_from_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote')
     and new.actor_id is not null
     and new.actor_id <> new.recipient_id then
    insert into private.push_outbox (recipient_id, actor_id, kind, post_id, notification_id, group_key)
    values (
      new.recipient_id,
      new.actor_id,
      new.kind,
      new.post_id,
      new.id,
      private.push_group_key(new.kind, new.post_id, new.actor_id)
    );
  end if;
  return null;
exception
  when others then
    raise warning 'push outbox skipped a notification (%)', sqlstate;
    return null;
end;
$$;

revoke all on function private.push_outbox_from_notification() from public, anon, authenticated;

drop trigger if exists notifications_push_outbox on public.notifications;
create trigger notifications_push_outbox
  after insert on public.notifications
  for each row
  execute function private.push_outbox_from_notification();

create or replace function private.push_outbox_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is not null and new.sender_id <> new.receiver_id then
    insert into private.push_outbox (recipient_id, actor_id, kind, message_id, group_key)
    values (
      new.receiver_id,
      new.sender_id,
      'dm',
      new.id,
      private.push_group_key('dm', null, new.sender_id)
    );
  end if;
  return null;
exception
  when others then
    raise warning 'push outbox skipped a message (%)', sqlstate;
    return null;
end;
$$;

revoke all on function private.push_outbox_from_message() from public, anon, authenticated;

drop trigger if exists messages_push_outbox on public.messages;
create trigger messages_push_outbox
  after insert on public.messages
  for each row
  execute function private.push_outbox_from_message();

-- ---------------------------------------------------------------------------
-- Service-role functions for the push routes
-- ---------------------------------------------------------------------------

-- Claims pending rows so two flushes never send the same one: the caller's
-- own rows from the last 10 minutes, plus a few overdue rows of anyone's.
create or replace function public.push_claim(p_actor uuid, p_limit integer, p_sweep_limit integer)
returns table (
  id uuid,
  recipient_id uuid,
  actor_id uuid,
  kind text,
  post_id uuid,
  notification_id uuid,
  message_id uuid,
  created_at timestamptz,
  status text,
  sent_at timestamptz,
  attempts integer,
  group_key text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with mine as (
    select o.id
    from private.push_outbox o
    where p_actor is not null
      and o.actor_id = p_actor
      and o.status = 'pending'
      and o.created_at > pg_catalog.now() - interval '10 minutes'
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '2 minutes')
      and o.attempts < 3
    order by o.created_at
    limit greatest(0, least(coalesce(p_limit, 0), 100))
    for update skip locked
  ),
  overdue as (
    select o.id
    from private.push_outbox o
    where o.status = 'pending'
      and o.created_at < pg_catalog.now() - interval '15 seconds'
      and o.created_at > pg_catalog.now() - interval '10 minutes'
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '2 minutes')
      and o.attempts < 3
    order by o.created_at
    limit greatest(0, least(coalesce(p_sweep_limit, 0), 100))
    for update skip locked
  ),
  picked as (
    select mine.id from mine
    union
    select overdue.id from overdue
  )
  update private.push_outbox o
  set claimed_at = pg_catalog.now(),
      attempts = o.attempts + 1
  from picked
  where o.id = picked.id
  returning o.id, o.recipient_id, o.actor_id, o.kind, o.post_id, o.notification_id,
    o.message_id, o.created_at, o.status, o.sent_at, o.attempts, o.group_key;
end;
$$;

-- Everything the sender checks at send time, read fresh.
create or replace function public.push_context(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o private.push_outbox;
  source_found boolean := false;
  post_found boolean := false;
  post_hidden boolean := false;
  post_text text;
  body text;
  message_kind text;
  note_metadata jsonb;
  note_created timestamptz;
begin
  select * into o from private.push_outbox where private.push_outbox.id = p_id;
  if not found then
    return null;
  end if;

  if o.kind = 'dm' then
    select m.content, coalesce(m.kind, 'text')
    into body, message_kind
    from public.messages m
    where m.id = o.message_id;
    source_found := found;
  else
    select n.metadata, n.created_at
    into note_metadata, note_created
    from public.notifications n
    where n.id = o.notification_id;
    source_found := found;
  end if;

  if o.post_id is not null then
    select p.hidden_at is not null, p.content
    into post_hidden, post_text
    from public.posts p
    where p.id = o.post_id;
    post_found := found;
  end if;

  if o.kind = 'comment' or (o.kind = 'mention' and note_metadata ->> 'source' = 'reply') then
    select c.body
    into body
    from public.comments c
    where c.post_id = o.post_id
      and c.user_id = o.actor_id
      and c.created_at <= coalesce(note_created, pg_catalog.now()) + interval '5 seconds'
    order by c.created_at desc
    limit 1;
  elsif o.kind in ('like', 'repost', 'quote', 'mention') then
    body := post_text;
  end if;

  return pg_catalog.jsonb_build_object(
    'source_exists', source_found,
    'recipient_exists', exists (select 1 from public.profiles p where p.id = o.recipient_id),
    'actor', (
      select pg_catalog.jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'username', p.username,
        'avatar_url', p.avatar_url
      )
      from public.profiles p
      where p.id = o.actor_id
    ),
    'post', case when post_found then pg_catalog.jsonb_build_object('hidden', post_hidden) else null end,
    'text', pg_catalog.left(body, 400),
    'message_kind', message_kind,
    'blocked', coalesce(private.is_blocked(o.actor_id, o.recipient_id), false),
    'muted', coalesce(private.is_muted(o.recipient_id, o.actor_id), false),
    'prefs', (
      select pg_catalog.to_jsonb(np) - 'user_id' - 'updated_at'
      from public.notification_prefs np
      where np.user_id = o.recipient_id
    ),
    'subscription_count', (
      select pg_catalog.count(*) from public.push_subscriptions s where s.user_id = o.recipient_id
    ),
    'badge', (
      select pg_catalog.count(*) from public.notifications n
      where n.recipient_id = o.recipient_id and not n.read
    ) + (
      select pg_catalog.count(*) from public.messages m
      where m.receiver_id = o.recipient_id and not m.read
    )
  );
end;
$$;

-- The newest push in a group, the recipient's recent push counts (rate
-- limits), and for DMs the unread messages from that sender.
create or replace function public.push_group_state(p_recipient uuid, p_group_key text, p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return pg_catalog.jsonb_build_object(
    'last_push_at', (
      select pg_catalog.max(o.sent_at)
      from private.push_outbox o
      where o.recipient_id = p_recipient
        and o.group_key = p_group_key
        and o.status = 'sent'
        and o.created_at > pg_catalog.now() - interval '1 day'
    ),
    'sent_last_minute', (
      select pg_catalog.count(*)
      from private.push_outbox o
      where o.recipient_id = p_recipient
        and o.status = 'sent'
        and o.sent_at > pg_catalog.now() - interval '1 minute'
    ),
    'sent_last_hour', (
      select pg_catalog.count(*)
      from private.push_outbox o
      where o.recipient_id = p_recipient
        and o.status = 'sent'
        and o.sent_at > pg_catalog.now() - interval '1 hour'
    ),
    'dm_unread', case
      when p_group_key like 'dm:%' and p_actor is not null then (
        select pg_catalog.count(*)
        from public.messages m
        where m.receiver_id = p_recipient
          and m.sender_id = p_actor
          and not m.read
      )
      else 0
    end
  );
end;
$$;

-- A group's sent and collapsed rows from the last day, with whether each one
-- would still notify (source row there, actor there, no block or mute).
create or replace function public.push_group_rows(p_recipient uuid, p_group_key text)
returns table (
  id uuid,
  recipient_id uuid,
  actor_id uuid,
  kind text,
  post_id uuid,
  notification_id uuid,
  message_id uuid,
  created_at timestamptz,
  status text,
  sent_at timestamptz,
  attempts integer,
  group_key text,
  valid boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select o.id, o.recipient_id, o.actor_id, o.kind, o.post_id, o.notification_id,
    o.message_id, o.created_at, o.status, o.sent_at, o.attempts, o.group_key,
    (
      case
        when o.kind = 'dm' then exists (select 1 from public.messages m where m.id = o.message_id)
        else exists (select 1 from public.notifications n where n.id = o.notification_id)
      end
      and exists (select 1 from public.profiles p where p.id = o.actor_id)
      and not coalesce(private.is_blocked(o.actor_id, o.recipient_id), false)
      and not coalesce(private.is_muted(o.recipient_id, o.actor_id), false)
    ) as valid
  from private.push_outbox o
  where o.recipient_id = p_recipient
    and o.group_key = p_group_key
    and o.status in ('sent', 'collapsed')
    and o.created_at > pg_catalog.now() - interval '1 day'
  order by o.created_at desc
  limit 500;
end;
$$;

create or replace function public.push_mark(p_ids uuid[], p_status text, p_sent_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'sent', 'collapsed', 'skipped', 'failed') then
    raise exception 'bad push status' using errcode = '22023';
  end if;
  update private.push_outbox o
  set status = p_status,
      sent_at = p_sent_at,
      claimed_at = null
  where o.id = any (p_ids);
end;
$$;

-- Groups with collapsed rows still waiting for their trailing summary.
create or replace function public.push_due_tails(p_limit integer)
returns table (recipient_id uuid, group_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select o.recipient_id, o.group_key
  from private.push_outbox o
  where o.status = 'collapsed'
    and o.sent_at is null
    and o.created_at > pg_catalog.now() - interval '2 hours'
  group by o.recipient_id, o.group_key
  order by pg_catalog.min(o.created_at)
  limit greatest(0, least(coalesce(p_limit, 0), 100));
end;
$$;

create or replace function public.push_take_lease(p_recipient uuid, p_group_key text, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken boolean;
begin
  insert into private.push_tail_leases as l (recipient_id, group_key, leased_until)
  values (
    p_recipient,
    p_group_key,
    pg_catalog.now() + pg_catalog.make_interval(secs => greatest(1, least(coalesce(p_seconds, 30), 120)))
  )
  on conflict (recipient_id, group_key) do update
  set leased_until = excluded.leased_until
  where l.leased_until < pg_catalog.now()
  returning true into taken;
  return coalesce(taken, false);
end;
$$;

create or replace function public.push_release_lease(p_recipient uuid, p_group_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.push_tail_leases l
  where l.recipient_id = p_recipient
    and l.group_key = p_group_key;
end;
$$;

-- Rows older than 7 days go. Pending rows past the 10-minute send window and
-- collapsed rows that never got a summary are closed as skipped.
create or replace function public.push_prune()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.push_outbox o
  where o.created_at < pg_catalog.now() - interval '7 days';
  get diagnostics removed = row_count;

  update private.push_outbox o
  set status = 'skipped', claimed_at = null
  where (o.status = 'pending' and o.created_at < pg_catalog.now() - interval '10 minutes')
     or (o.status = 'collapsed' and o.sent_at is null and o.created_at < pg_catalog.now() - interval '2 hours');

  delete from private.push_tail_leases l
  where l.leased_until < pg_catalog.now() - interval '5 minutes';

  return removed;
end;
$$;

revoke all on function public.push_claim(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.push_context(uuid) from public, anon, authenticated;
revoke all on function public.push_group_state(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.push_group_rows(uuid, text) from public, anon, authenticated;
revoke all on function public.push_mark(uuid[], text, timestamptz) from public, anon, authenticated;
revoke all on function public.push_due_tails(integer) from public, anon, authenticated;
revoke all on function public.push_take_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.push_release_lease(uuid, text) from public, anon, authenticated;
revoke all on function public.push_prune() from public, anon, authenticated;

grant execute on function public.push_claim(uuid, integer, integer) to service_role;
grant execute on function public.push_context(uuid) to service_role;
grant execute on function public.push_group_state(uuid, text, uuid) to service_role;
grant execute on function public.push_group_rows(uuid, text) to service_role;
grant execute on function public.push_mark(uuid[], text, timestamptz) to service_role;
grant execute on function public.push_due_tails(integer) to service_role;
grant execute on function public.push_take_lease(uuid, text, integer) to service_role;
grant execute on function public.push_release_lease(uuid, text) to service_role;
grant execute on function public.push_prune() to service_role;
