-- Per-user sold-comps rate limits (service role only; serverless-safe).

create table if not exists public.comps_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table public.comps_rate_limits enable row level security;

-- No policies: Next.js server reads/writes with the service role only.

revoke all on public.comps_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.comps_rate_limits to service_role;
