-- Read-only catalog check for profile pins.
-- Selects function and policy definitions only.
-- Does not insert, update, delete, or change roles.
-- Run after 20261023003000_profile_pinned_post.sql is applied.

do $verify$
declare
  nullable text;
  delete_action "char";
  pin_definer boolean;
  unpin_definer boolean;
  enforce_definer boolean;
  clear_definer boolean;
  pin_config text;
  unpin_config text;
  enforce_config text;
  clear_config text;
  pin_src text;
  trigger_src text;
  clear_src text;
  anon_can_pin boolean;
  anon_can_unpin boolean;
  auth_can_pin boolean;
  auth_can_unpin boolean;
  anon_can_enforce boolean;
  auth_can_enforce boolean;
  anon_can_clear boolean;
  auth_can_clear boolean;
  username_trigger boolean;
  pin_trigger_def text;
  pin_trigger_enabled "char";
  hidden_trigger_def text;
  hidden_trigger_enabled "char";
  qualified_body text;
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

  select p.prosecdef, p.proconfig::text
    into enforce_definer, enforce_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'enforce_own_pinned_post'
    and pg_get_function_identity_arguments(p.oid) = '';

  select p.prosecdef, p.proconfig::text
    into clear_definer, clear_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'clear_pin_when_post_hidden'
    and pg_get_function_identity_arguments(p.oid) = '';

  if coalesce(pin_definer, false)
     and coalesce(unpin_definer, false)
     and coalesce(enforce_definer, false)
     and coalesce(clear_definer, false)
     and (pin_config = '{search_path=""}' or pin_config = array['search_path=""']::text)
     and (unpin_config = '{search_path=""}' or unpin_config = array['search_path=""']::text)
     and (enforce_config = '{search_path=""}' or enforce_config = array['search_path=""']::text)
     and (clear_config = '{search_path=""}' or clear_config = array['search_path=""']::text) then
    raise notice 'PASS: pin functions are security definer with search_path=""';
  else
    raise notice 'FAIL: pin function settings pin=% % unpin=% % enforce=% % clear=% %',
      pin_definer, pin_config, unpin_definer, unpin_config,
      enforce_definer, enforce_config, clear_definer, clear_config;
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

  if coalesce(trigger_src, '') ilike '%user_id = new.id%'
     and coalesce(pin_src, '') ilike '%hidden_at is null%'
     and coalesce(trigger_src, '') ilike '%hidden_at is null%' then
    raise notice 'PASS: pin checks require a visible post the profile owns';
  else
    raise notice 'FAIL: enforce_own_pinned_post or pin_post is missing hidden_at is null';
  end if;

  select pg_get_functiondef(p.oid)
    into clear_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'clear_pin_when_post_hidden'
    and pg_get_function_identity_arguments(p.oid) = '';

  if coalesce(clear_src, '') ilike '%pinned_post_id = null%'
     and coalesce(clear_src, '') ilike '%new.hidden_at is not null%' then
    raise notice 'PASS: hiding a post clears profiles.pinned_post_id';
  else
    raise notice 'FAIL: clear_pin_when_post_hidden is missing';
  end if;

  select pg_get_functiondef(p.oid)
    into qualified_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname in ('public', 'private')
    and p.prokind in ('f', 'p')
    and l.lanname in ('sql', 'plpgsql')
    and coalesce(pg_get_functiondef(p.oid), '') ~* $re$pg_catalog\s*\.\s*(coalesce|nullif|greatest|least)\s*\($re$
  limit 1;

  if qualified_body is null then
    raise notice 'PASS: no function body schema-qualifies coalesce, nullif, greatest, or least';
  else
    raise notice 'FAIL: function body schema-qualifies coalesce, nullif, greatest, or least';
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

  select pg_get_triggerdef(t.oid), t.tgenabled
    into pin_trigger_def, pin_trigger_enabled
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles'
    and t.tgname = 'profiles_enforce_own_pin'
    and not t.tgisinternal;

  if username_trigger
     and coalesce(pin_trigger_def, '') ilike '%before insert or update of pinned_post_id%'
     and pin_trigger_enabled in ('O', 'A') then
    raise notice 'PASS: profiles_reserve_username exists and profiles_enforce_own_pin is a before pin trigger';
  else
    raise notice 'FAIL: username_trigger=% pin_trigger=% enabled=%',
      username_trigger, pin_trigger_def, pin_trigger_enabled;
  end if;

  select pg_get_triggerdef(t.oid), t.tgenabled
    into hidden_trigger_def, hidden_trigger_enabled
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'posts'
    and t.tgname = 'posts_clear_pin_when_hidden'
    and not t.tgisinternal;

  if coalesce(hidden_trigger_def, '') ilike '%after update of hidden_at%'
     and hidden_trigger_enabled in ('O', 'A') then
    raise notice 'PASS: posts_clear_pin_when_hidden is enabled';
  else
    raise notice 'FAIL: hidden trigger=% enabled=%', hidden_trigger_def, hidden_trigger_enabled;
  end if;

  if to_regprocedure('private.enforce_own_pinned_post()') is null
     or to_regprocedure('private.clear_pin_when_post_hidden()') is null then
    anon_can_enforce := null;
    auth_can_enforce := null;
    anon_can_clear := null;
    auth_can_clear := null;
  else
    anon_can_enforce := has_function_privilege('anon', 'private.enforce_own_pinned_post()', 'execute');
    auth_can_enforce := has_function_privilege('authenticated', 'private.enforce_own_pinned_post()', 'execute');
    anon_can_clear := has_function_privilege('anon', 'private.clear_pin_when_post_hidden()', 'execute');
    auth_can_clear := has_function_privilege('authenticated', 'private.clear_pin_when_post_hidden()', 'execute');
  end if;

  if anon_can_enforce = false
     and auth_can_enforce = false
     and anon_can_clear = false
     and auth_can_clear = false then
    raise notice 'PASS: anon and authenticated cannot execute the pin trigger functions';
  else
    raise notice 'FAIL: trigger grants anon_enforce=% auth_enforce=% anon_clear=% auth_clear=%',
      anon_can_enforce, auth_can_enforce, anon_can_clear, auth_can_clear;
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
