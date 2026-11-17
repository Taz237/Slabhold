-- UNAPPLIED. Needs review before running.
-- Do not `supabase db push` this, and do not apply it with the Supabase CLI.
-- The undo is docs/catalog-feed-1/undo-card-likes-comments.sql.
--
-- Hearts and comments on cards, for the Catalog feed.
--
-- Why: likes and comments only exist on posts today. The feed's heart and
-- comments use a card's newest post, so a card that was never posted can't
-- be liked or talked about (its heart stays on the viewer's device).
-- These two small tables let every public card take both. Saves need
-- nothing new: the bookmark writes to want_list.
--
-- public.card_likes
--   One heart per person per card (primary key card_id, user_id).
--   Anyone can read hearts on public cards; you add and remove only your
--   own, only on a public card, and never on the card of someone who
--   blocked you (or whom you blocked). Gone with the card or the account.
--
-- public.card_comments
--   Text only, 1 to 280 characters, like post replies. Read on public
--   cards (blocks hide them); you write and delete only your own. The card
--   owner can also delete comments on their card.
--
-- Not in this file (follow-ups once this is reviewed): like counts on a
-- column, notifications, and the rate-limit trigger. The server action
-- already applies the hourly like limit before it writes.

begin;

create table if not exists public.card_likes (
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create index if not exists card_likes_user_created_idx
  on public.card_likes (user_id, created_at desc);

alter table public.card_likes enable row level security;

revoke all on table public.card_likes from public, anon, authenticated;
grant select on table public.card_likes to anon, authenticated;
grant insert, delete on table public.card_likes to authenticated;

drop policy if exists "Read hearts on public cards" on public.card_likes;
create policy "Read hearts on public cards"
  on public.card_likes for select
  to anon, authenticated
  using (
    exists (select 1 from public.public_cards c where c.id = card_likes.card_id)
    and not private.is_blocked((select auth.uid()), user_id)
  );

drop policy if exists "Heart public cards as yourself" on public.card_likes;
create policy "Heart public cards as yourself"
  on public.card_likes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.public_cards c
      where c.id = card_likes.card_id
        and not private.is_blocked((select auth.uid()), c.user_id)
    )
  );

drop policy if exists "Remove your own hearts" on public.card_likes;
create policy "Remove your own hearts"
  on public.card_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint card_comments_body_len check (
    char_length(btrim(body, E' \t\r\n')) between 1 and 280
  )
);

create index if not exists card_comments_card_created_idx
  on public.card_comments (card_id, created_at desc);

alter table public.card_comments enable row level security;

revoke all on table public.card_comments from public, anon, authenticated;
grant select on table public.card_comments to anon, authenticated;
grant insert, delete on table public.card_comments to authenticated;

drop policy if exists "Read comments on public cards" on public.card_comments;
create policy "Read comments on public cards"
  on public.card_comments for select
  to anon, authenticated
  using (
    exists (select 1 from public.public_cards c where c.id = card_comments.card_id)
    and not private.is_blocked((select auth.uid()), user_id)
  );

drop policy if exists "Comment on public cards as yourself" on public.card_comments;
create policy "Comment on public cards as yourself"
  on public.card_comments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.public_cards c
      where c.id = card_comments.card_id
        and not private.is_blocked((select auth.uid()), c.user_id)
    )
  );

drop policy if exists "Delete your comments or ones on your card" on public.card_comments;
create policy "Delete your comments or ones on your card"
  on public.card_comments for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.cards c
      where c.id = card_comments.card_id
        and c.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

commit;
