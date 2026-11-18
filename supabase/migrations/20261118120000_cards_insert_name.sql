-- UNAPPLIED. Needs review before running.
-- Do not `supabase db push` this, and do not apply it with the Supabase CLI.
--
-- The insert a card is in, saved with it: "Rookie Code" for the 2026-27 Topps
-- Rookie Code #RC-3. Set by the scanner when the checklist places the card #
-- in an insert section (lib/cards/insert-name.ts). Never the parallel.
--
-- public.cards.insert_name
--   Nullable text, at most 80 characters. Null for every existing card and for
--   any card that isn't in an insert. No backfill, no index: it is only read
--   with the owner's own cards (select *), and written by the owner's save.
--   The existing cards RLS policies cover it; nothing new is granted.
--
-- Safe to apply before or after the app change: until it is applied, the app
-- saves a scanned insert card again without insert_name and keeps every other
-- detail. public.public_cards is not changed here, so other people don't see
-- the insert name yet.

alter table public.cards
  add column if not exists insert_name text;

alter table public.cards
  drop constraint if exists cards_insert_name_length;

alter table public.cards
  add constraint cards_insert_name_length
  check (insert_name is null or char_length(insert_name) between 1 and 80);

comment on column public.cards.insert_name is
  'The insert the card is in (e.g. Rookie Code), from a scan. Null when none.';
