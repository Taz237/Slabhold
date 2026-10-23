-- Read-only check for the test-account auto-follow skip.
-- Not a migration. Do not run supabase db push with this file.
-- transaction_read_only is on. This script does not insert, update, or
-- delete follow rows or profile rows. Existing follows are only counted.
-- The env uuid (OFFICIAL_UPDATES_USER_ID) and this SQL uuid must stay in sync.
--
-- The trigger check uses pg_trigger, not pg_get_triggerdef text.
-- tgtype 5 is ROW (1) + INSERT (4): after insert, for each row, and not
-- before, update, or delete. tgenabled <> 'D' means the trigger is not disabled.

begin;

set local transaction_read_only = on;
set local lock_timeout = '5s';

do $$
declare
  fn_src text;
  fn_definer boolean;
  fn_config text;
  fn_triggers integer;
  good_triggers integer;
  anon_execute boolean;
  auth_execute boolean;
  test_follows bigint;
  updates_id pg_catalog.uuid := '6d31ab97-9162-4296-876d-9e0378872fce';
begin
  select p.prosrc, p.prosecdef, p.proconfig::text
    into fn_src, fn_definer, fn_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'follow_official_updates';

  if fn_src is null then
    raise notice 'FAIL: private.follow_official_updates is missing';
  elsif fn_definer then
    raise notice 'FAIL: function is security definer';
  elsif position('new.is_test is true' in fn_src) = 0
     or position('lower(new.username) ~ ''^(qa_|qa-|test_|vreset_)''' in fn_src) = 0 then
    raise notice 'FAIL: skip for is_test or qa_/qa-/test_/vreset_ handles is missing';
  elsif fn_config is distinct from '{"search_path=\"\""}' then
    raise notice 'FAIL: search_path is not set to empty (%)', fn_config;
  else
    select
      count(*) filter (
        where not t.tgisinternal
          and t.tgfoid = 'private.follow_official_updates()'::regprocedure
      ),
      count(*) filter (
        where not t.tgisinternal
          and t.tgfoid = 'private.follow_official_updates()'::regprocedure
          and t.tgtype = 5
          and t.tgenabled <> 'D'
      )
      into fn_triggers, good_triggers
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname = 'profiles';

    anon_execute := pg_catalog.has_function_privilege(
      'anon',
      'private.follow_official_updates()',
      'EXECUTE'
    );
    auth_execute := pg_catalog.has_function_privilege(
      'authenticated',
      'private.follow_official_updates()',
      'EXECUTE'
    );

    if fn_triggers is distinct from 1 or good_triggers is distinct from 1 then
      raise notice 'FAIL: expected exactly 1 non-internal after insert row trigger (tgtype 5, tgenabled <> D) on public.profiles, found % calling the function (% matching)', fn_triggers, good_triggers;
    elsif anon_execute or auth_execute then
      raise notice 'FAIL: anon or authenticated can execute private.follow_official_updates()';
    else
      raise notice 'PASS: skips is_test and qa_/qa-/test_/vreset_, not security definer, empty search_path, after insert only, execute revoked';
    end if;
  end if;

  select count(*)
    into test_follows
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = updates_id
    and (
      p.is_test is true
      or lower(p.username) ~ '^(qa_|qa-|test_|vreset_)'
    );

  raise notice 'INFO: existing test-account follows of the updates profile, left unchanged: %', test_follows;
end;
$$;

rollback;
