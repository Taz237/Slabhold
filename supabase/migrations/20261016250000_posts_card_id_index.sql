-- Speed up "posts attached to this card" lookups (card is jsonb snapshot).
create index if not exists posts_card_id_idx on public.posts ((card->>'id'));
