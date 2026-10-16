-- Trusted per-card market value (service role writes; server reads with service role).

create table if not exists public.card_values (
  card_id uuid primary key references public.cards (id) on delete cascade,
  median numeric,
  low numeric,
  high numeric,
  n_sales int not null default 0,
  status text not null,
  query_key text,
  matched_at timestamptz
);

create index if not exists card_values_matched_at_idx
  on public.card_values (matched_at nulls first);

alter table public.card_values enable row level security;

-- No insert/update/delete (or select) policies: only the service role writes;
-- the Next.js server reads with the service role.

revoke all on public.card_values from anon, authenticated;
grant select, insert, update, delete on public.card_values to service_role;
