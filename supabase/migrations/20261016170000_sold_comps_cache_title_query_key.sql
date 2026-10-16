-- Persist listing titles and key cache by query (card + number + grade + parallel).

alter table public.sold_comps_cache
  add column if not exists title text;

alter table public.sold_comps_cache
  add column if not exists query_key text;

-- Old rows used empty titles / card_id-only keys; drop them.
delete from public.sold_comps_cache;

alter table public.sold_comps_cache
  drop constraint if exists sold_comps_cache_card_id_item_id_sold_at_key;

alter table public.sold_comps_cache
  drop constraint if exists sold_comps_cache_query_key_item_id_sold_at_key;

alter table public.sold_comps_cache
  add constraint sold_comps_cache_query_key_item_id_sold_at_key
  unique (query_key, item_id, sold_at);

create index if not exists sold_comps_cache_query_key_fetched_idx
  on public.sold_comps_cache (query_key, fetched_at);
