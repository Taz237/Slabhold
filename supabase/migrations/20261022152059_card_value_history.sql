-- Daily card value history for "your cards up and down since yesterday".
-- UNAPPLIED. Donnie must approve this SQL and the cron before either runs.
-- Do not apply database changes from 7:00 PM to 11:00 PM America/New_York.
-- Service role writes. Authenticated users can read only their own rows.
-- Retention: after each write, the service-role cron removes rows older than 400 days.

create table if not exists public.card_value_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  snapshot_date date not null,
  median numeric,
  previous_median numeric,
  delta numeric,
  created_at timestamptz not null default now(),
  primary key (card_id, snapshot_date)
);

create index if not exists card_value_history_user_date_idx
  on public.card_value_history (user_id, snapshot_date);

alter table public.card_value_history enable row level security;

drop policy if exists "Users read own card value history" on public.card_value_history;
create policy "Users read own card value history"
  on public.card_value_history
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.card_value_history from anon, authenticated;
grant select on public.card_value_history to authenticated;
grant select, insert, update, delete on public.card_value_history to service_role;
