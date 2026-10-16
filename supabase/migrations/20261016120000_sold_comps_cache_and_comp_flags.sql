-- Sold comps cache (service role writes; app reads via server) + per-user "not a match" flags.

create table if not exists public.sold_comps_cache (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  item_id text not null,
  price numeric not null,
  currency text,
  sold_at timestamptz,
  grader text,
  grade text,
  url text,
  fetched_at timestamptz not null default now(),
  unique (card_id, item_id, sold_at)
);

create index if not exists sold_comps_cache_card_fetched_idx
  on public.sold_comps_cache (card_id, fetched_at);

alter table public.sold_comps_cache enable row level security;

-- No insert/update/delete (or select) policies: only the service role writes;
-- the Next.js server reads with the service role.

revoke all on public.sold_comps_cache from anon, authenticated;
grant select, insert, update, delete on public.sold_comps_cache to service_role;

create table if not exists public.comp_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, card_id, item_id)
);

create index if not exists comp_flags_user_card_idx
  on public.comp_flags (user_id, card_id);

alter table public.comp_flags enable row level security;

grant select, insert on public.comp_flags to authenticated;

drop policy if exists "Users insert own comp flags" on public.comp_flags;
drop policy if exists "Users select own comp flags" on public.comp_flags;

create policy "Users insert own comp flags"
  on public.comp_flags
  for insert
  with check (auth.uid() = user_id);

create policy "Users select own comp flags"
  on public.comp_flags
  for select
  using (auth.uid() = user_id);
