-- Read-only checks for the deal log. Do not apply this file.
-- Safe to run after 20261022234124_deal_log.sql. It does not insert, update, or delete.

select
  c.relname as table_name,
  c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'deals';

select
  pol.polname as policy_name,
  pol.polcmd as command
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'deals';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'deals_one_pending_per_card';

select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('create_deal', 'respond_deal', 'cancel_deal', 'reject_direct_deal_write')
  and n.nspname in ('public', 'private')
order by n.nspname, p.proname;

select
  has_table_privilege('authenticated', 'public.deals', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.deals', 'insert') as authenticated_insert,
  has_table_privilege('authenticated', 'public.deals', 'update') as authenticated_update,
  has_table_privilege('anon', 'public.deals', 'insert') as anon_insert,
  has_table_privilege('anon', 'public.deals', 'update') as anon_update;
