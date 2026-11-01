-- UNAPPLIED. Needs review before running.
--
-- Invite code resets prune: stop private.invite_code_resets growing forever.
--
-- public.reset_invite_code() adds one row per reset and only counts rows from
-- the last 24 hours (3 a day). Nothing deleted old rows.
--
-- public.prune_invite_code_resets() returns integer
--   Deletes reset rows older than 2 days and returns how many it removed.
--   The 2-day cutoff is safe: the limit only looks back 24 hours, so a pruned
--   row could never count again. Called once a day by the collection-snapshots
--   cron (app/api/cron/collection-snapshots/route.ts) with the service role.
--   pg_cron is not installed on prod, so it is not used here.
--
-- Re-runnable: create or replace, and revoke/grant are idempotent.
--
-- SECURITY REVIEW: prune_invite_code_resets is security definer (the resets
-- table has no client grants). search_path is empty and every name is
-- schema-qualified. It takes no arguments. Execute is revoked from public,
-- anon and authenticated and granted to service_role only. No table grants
-- change.
--
-- public.profiles is not touched.

begin;

set local lock_timeout = '5s';

create or replace function public.prune_invite_code_resets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.invite_code_resets as r
  where r.created_at < pg_catalog.now() - interval '2 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.prune_invite_code_resets() is
  'Daily cron: deletes invite code reset rows older than 2 days. The reset limit only looks back 24 hours.';

revoke all on function public.prune_invite_code_resets() from public, anon, authenticated;
grant execute on function public.prune_invite_code_resets() to service_role;

commit;

notify pgrst, 'reload schema';
