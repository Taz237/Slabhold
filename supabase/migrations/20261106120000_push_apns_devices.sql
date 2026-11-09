-- UNAPPLIED. Needs review before running. (ios-push-1)
-- iPhone app push: one row per APNs device token. Written only by the server
-- (service role) through /api/push/apns; a signed-in user can read and delete
-- only their own rows. Nothing else changes: push_context and every existing
-- push table, function and grant stay as they are.
begin;
set local lock_timeout = '5s';
create table if not exists public.push_apns_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0,
  constraint push_apns_devices_token_hex check (token ~ '^[0-9a-f]{64,200}$'),
  constraint push_apns_devices_failures check (failure_count >= 0)
);
create index if not exists push_apns_devices_user_id_idx on public.push_apns_devices (user_id);
alter table public.push_apns_devices enable row level security;
revoke all on table public.push_apns_devices from public, anon, authenticated;
grant select, delete on table public.push_apns_devices to authenticated;
grant select, insert, update, delete on table public.push_apns_devices to service_role;
drop policy if exists "Read own APNs devices" on public.push_apns_devices;
create policy "Read own APNs devices" on public.push_apns_devices
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Delete own APNs devices" on public.push_apns_devices;
create policy "Delete own APNs devices" on public.push_apns_devices
  for delete to authenticated using ((select auth.uid()) = user_id);
commit;
