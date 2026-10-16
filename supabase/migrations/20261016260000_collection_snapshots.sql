-- Daily collection value snapshots (service role writes; users read their own rows).

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

create policy "Users can read own collection snapshots"
  on public.collection_snapshots
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated — only service role writes.
revoke all on public.collection_snapshots from anon, authenticated;
grant select on public.collection_snapshots to authenticated;
grant select, insert, update, delete on public.collection_snapshots to service_role;
