-- Want alerts store the sale or Mail Day payload on the existing notification.
-- kind stays want_alert. No backfill.

alter table public.notifications
  add column if not exists metadata jsonb;
