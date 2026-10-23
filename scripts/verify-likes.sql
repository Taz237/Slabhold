-- Read-only shape check for the likes migration. Rolls back even though it
-- only reads the catalog, so it is safe to run on a database that has the
-- migration applied.
begin;

do $check$
declare
  pk_cols text;
  fk_delete text;
  index_def text;
  select_policy text;
  insert_policy text;
  delete_policy text;
  update_policies int;
  update_grants int;
  like_count_ok boolean;
  sync_definer boolean;
  sync_path text;
  anon_exec boolean;
  auth_exec boolean;
  public_exec boolean;
  migrate_auth boolean;
  migrate_anon boolean;
begin
  if to_regclass('public.likes') is null then
    raise exception 'public.likes is missing';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'likes'
      and column_name in ('post_id', 'user_id', 'created_at', 'suppress_notify')
  ) <> 4 then
    raise exception 'likes is missing post_id, user_id, created_at, or suppress_notify';
  end if;

  select string_agg(a.attname, ',' order by k.ord)
  into pk_cols
  from pg_constraint c
  join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.conrelid = 'public.likes'::regclass
    and c.contype = 'p';
  if pk_cols is distinct from 'post_id,user_id' then
    raise exception 'likes primary key is %, expected post_id,user_id', pk_cols;
  end if;

  select string_agg(pg_get_constraintdef(oid), ' ')
  into fk_delete
  from pg_constraint
  where conrelid = 'public.likes'::regclass
    and contype = 'f';
  if fk_delete is null
     or fk_delete not ilike '%posts(id)%'
     or fk_delete not ilike '%users(id)%'
     or (length(fk_delete) - length(replace(lower(fk_delete), 'on delete cascade', '')))
        < length('on delete cascade') * 2 then
    raise exception 'likes foreign keys are not both on delete cascade: %', fk_delete;
  end if;

  select indexdef
  into index_def
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'likes'
    and indexname = 'likes_user_created_idx';
  if index_def is null or index_def not ilike '%(user_id, created_at DESC)%' then
    raise exception 'likes_user_created_idx is missing or not (user_id, created_at desc): %', index_def;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.likes'::regclass) then
    raise exception 'likes row level security is off';
  end if;

  select count(*)
  into update_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'likes'
    and cmd = 'UPDATE';
  if update_policies <> 0 then
    raise exception 'likes has an update policy';
  end if;

  select qual
  into select_policy
  from pg_policies
  where schemaname = 'public' and tablename = 'likes' and policyname = 'Read likes on visible posts';
  if select_policy is null or select_policy not like '%posts%' then
    raise exception 'likes select policy does not follow posts visibility';
  end if;

  select with_check
  into insert_policy
  from pg_policies
  where schemaname = 'public' and tablename = 'likes' and policyname = 'Insert own likes';
  if insert_policy is null
     or insert_policy not like '%uid()%'
     or insert_policy not like '%suppress_notify%'
     or insert_policy not like '%is_blocked%' then
    raise exception 'likes insert policy is missing owner, flag, or block check: %', insert_policy;
  end if;

  select qual
  into delete_policy
  from pg_policies
  where schemaname = 'public' and tablename = 'likes' and policyname = 'Delete own likes';
  if delete_policy is null or delete_policy not like '%uid()%' then
    raise exception 'likes delete policy is not own rows only';
  end if;

  select count(*)
  into update_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'likes'
    and privilege_type = 'UPDATE'
    and grantee in ('anon', 'authenticated', 'public');
  if update_grants <> 0 then
    raise exception 'likes update is granted to anon, authenticated, or public';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'like_count'
      and is_nullable = 'NO'
      and column_default like '%0%'
      and data_type = 'integer'
  )
  into like_count_ok;
  if not like_count_ok then
    raise exception 'posts.like_count is not a non-null integer defaulting to 0';
  end if;

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
  into sync_definer, sync_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'sync_like';
  if sync_definer is not true or sync_path not like '%search_path=%' then
    raise exception 'private.sync_like must be security definer with an empty search_path, got % %', sync_definer, sync_path;
  end if;

  select has_function_privilege('anon', 'private.sync_like()', 'execute') into anon_exec;
  select has_function_privilege('authenticated', 'private.sync_like()', 'execute') into auth_exec;
  select has_function_privilege('public', 'private.sync_like()', 'execute') into public_exec;
  if anon_exec or auth_exec or public_exec then
    raise exception 'private.sync_like is still executable by anon, authenticated, or public';
  end if;

  select has_function_privilege('authenticated', 'public.migrate_local_likes(uuid[])', 'execute')
  into migrate_auth;
  select has_function_privilege('anon', 'public.migrate_local_likes(uuid[])', 'execute')
  into migrate_anon;
  if migrate_auth is not true or migrate_anon then
    raise exception 'migrate_local_likes grants are wrong (authenticated %, anon %)', migrate_auth, migrate_anon;
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.likes'::regclass
      and tgname in ('likes_after_insert', 'likes_after_delete')
      and not tgisinternal
  ) then
    raise exception 'likes insert/delete triggers are missing';
  end if;
end
$check$;

rollback;
