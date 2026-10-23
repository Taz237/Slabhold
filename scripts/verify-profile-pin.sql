-- Read-only catalog check for profile pins.
-- Selects function and policy definitions only.
-- Does not insert, update, delete, or change roles.
-- Run after 20261022240000_profile_pinned_post.sql is applied.

do $verify$
declare
  nullable text;
  delete_action "char";
  pin_definer boolean;
  unpin_definer boolean;
  pin_config text;
  unpin_config text;
  pin_src text;
  trigger_src text;
  anon_can_pin boolean;
  anon_can_unpin boolean;
  auth_can_pin boolean;
  auth_can_unpin boolean;
  username_trigger boolean;
  pin_trigger boolean;
  policy_qual text;
begin
  select c.is_nullable
    into nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'pinned_post_id';

  if nullable = 'YES' then
    raise notice 'PASS: profiles.pinned_post_id is nullable';
  else
    raise notice 'FAIL: profiles.pinned_post_id nullable=%', coalesce(nullable, 'missing');
  end if;

  select con.confdeltype
    into delete_action
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.conname = 'profiles_pinned_post_id_fkey'
    and con.contype = 'f';

  if delete_action = 'n' then
    raise notice 'PASS: pinned_post_id references posts on delete set null';
  else
    raise notice 'FAIL: pinned_post_id delete action=%', coalesce(delete_action::text, 'missing');
  end if;

  select p.prosecdef, p.proconfig::text
    into pin_definer, pin_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'pin_post'
    and pg_get_function_identity_arguments(p.oid) = 'post_id uuid';

  select p.prosecdef, p.proconfig::text
    into unpin_definer, unpin_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'unpin_post'
    and pg_get_function_identity_arguments(p.oid) = '';

  if coalesce(pin_definer, false)
     and coalesce(unpin_definer, false)
     and coalesce(pin_config, '') ilike '%search_path%'
     and coalesce(unpin_config, '') ilike '%search_path%' then
    raise notice 'PASS: pin_post and unpin_post are security definer with a fixed search_path';
  else
    raise notice 'FAIL: pin function settings pin=% % unpin=% %',
      pin_definer, pin_config, unpin_definer, unpin_config;
  end if;

  select pg_get_functiondef(p.oid)
    into pin_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'pin_post'
    and pg_get_function_identity_arguments(p.oid) = 'post_id uuid';

  if coalesce(pin_src, '') ilike '%auth.uid()%'
     and coalesce(pin_src, '') ilike '%user_id%' then
    raise notice 'PASS: pin_post checks the caller owns the post';
  else
    raise notice 'FAIL: pin_post is missing an ownership check';
  end if;

  select pg_get_functiondef(p.oid)
    into trigger_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'enforce_own_pinned_post';

  if coalesce(trigger_src, '') ilike '%user_id = new.id%' then
    raise notice 'PASS: pin trigger rejects a post the profile does not own';
  else
    raise notice 'FAIL: enforce_own_pinned_post is missing';
  end if;

  anon_can_pin := has_function_privilege('anon', 'public.pin_post(uuid)', 'execute');
  anon_can_unpin := has_function_privilege('anon', 'public.unpin_post()', 'execute');
  auth_can_pin := has_function_privilege('authenticated', 'public.pin_post(uuid)', 'execute');
  auth_can_unpin := has_function_privilege('authenticated', 'public.unpin_post()', 'execute');

  if anon_can_pin = false
     and anon_can_unpin = false
     and auth_can_pin
     and auth_can_unpin then
    raise notice 'PASS: anon cannot pin or unpin; authenticated can';
  else
    raise notice 'FAIL: grants anon_pin=% anon_unpin=% auth_pin=% auth_unpin=%',
      anon_can_pin, anon_can_unpin, auth_can_pin, auth_can_unpin;
  end if;

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and t.tgname = 'profiles_reserve_username'
      and not t.tgisinternal
  ) into username_trigger;

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and t.tgname = 'profiles_enforce_own_pin'
      and not t.tgisinternal
  ) into pin_trigger;

  if username_trigger and pin_trigger then
    raise notice 'PASS: profiles_reserve_username and profiles_enforce_own_pin both exist';
  else
    raise notice 'FAIL: username_trigger=% pin_trigger=%', username_trigger, pin_trigger;
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid)
    into policy_qual
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles'
    and pol.polname = 'Users update own profile'
    and pol.polcmd = 'w';

  if coalesce(policy_qual, '') ilike '%uid()%' then
    raise notice 'PASS: Users update own profile still requires auth.uid()';
  else
    raise notice 'FAIL: profile update policy qual=%', coalesce(policy_qual, 'missing');
  end if;
end
$verify$;
