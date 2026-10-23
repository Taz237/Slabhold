-- Shape check for the likes migration. Writes nothing that survives: the
-- transaction ends in rollback. Safe to run on a database that has the
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
  note_policy text;
  note_definer boolean;
  note_path text;
  note_src text;
  src text;
  fn text;
  protect_definer boolean;
  protect_src text;
  trigger_def text;
  like_policies int;
  note_inserts int;
  owner_match boolean;
  check_def text;
begin
  if to_regclass('public.likes') is null then
    raise exception 'public.likes is missing';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'supabase_migrations.schema_migrations is missing';
  end if;
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20261023120000'
  ) then
    raise exception 'likes migration 20261023120000 is not recorded';
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

  select indexdef
  into index_def
  from pg_indexes
  where indexname = 'notifications_like_once';
  if index_def is null
     or index_def not ilike '%(actor_id, post_id)%'
     or index_def not ilike '%kind%like%' then
    raise exception 'notifications_like_once is missing: %', index_def;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.likes'::regclass) then
    raise exception 'likes row level security is off';
  end if;

  select count(*)
  into like_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'likes';
  if like_policies <> 3 then
    raise exception 'likes has % policies, expected select, insert, and delete', like_policies;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'likes'
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'likes has a permissive true policy';
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
  if select_policy is null
     or select_policy not like '%posts%'
     or select_policy not like '%is_blocked%' then
    raise exception 'likes select policy does not hide blocked likers: %', select_policy;
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

  select pg_get_constraintdef(oid)
  into check_def
  from pg_constraint
  where conrelid = 'public.posts'::regclass
    and conname = 'posts_like_count_nonnegative';
  if check_def is null or check_def not like '%like_count >= 0%' then
    raise exception 'posts.like_count is missing a non-negative check: %', check_def;
  end if;

  if exists (
    select 1
    from public.posts p
    where p.like_count < 0
       or p.like_count <> (
         select count(*)
         from public.likes l
         where l.post_id = p.id
       )
  ) then
    raise exception 'like_count drifted from the likes rows or is negative';
  end if;

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), p.prosrc
  into sync_definer, sync_path, src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'sync_like';
  if sync_definer is not true or sync_path not like '%search_path=%' then
    raise exception 'private.sync_like must be security definer with an empty search_path, got % %', sync_definer, sync_path;
  end if;
  if src like '%delete from public.notifications%' or src like '%pg_trigger_depth%' then
    raise exception 'sync_like still deletes like notices or depends on trigger depth';
  end if;
  if src ~* 'pg_catalog\.(nullif|coalesce|greatest|least)\s*\(' then
    raise exception 'sync_like schema-qualifies coalesce, nullif, greatest, or least';
  end if;
  if src ~* '(from|into|update|join)\s+(likes|posts|notifications|follows|reposts|comments|profiles)\M' then
    raise exception 'sync_like uses an unqualified table name';
  end if;

  select p.proowner = c.relowner
  into owner_match
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_class c on c.oid = 'public.posts'::regclass
  where n.nspname = 'private'
    and p.proname = 'sync_like';
  if owner_match is not true then
    raise exception 'sync_like owner is not the posts table owner';
  end if;

  select has_function_privilege('anon', 'private.sync_like()', 'execute') into anon_exec;
  select has_function_privilege('authenticated', 'private.sync_like()', 'execute') into auth_exec;
  select has_function_privilege('public', 'private.sync_like()', 'execute') into public_exec;
  if anon_exec or auth_exec or public_exec then
    raise exception 'private.sync_like is still executable by anon, authenticated, or public';
  end if;

  select p.prosecdef, p.prosrc
  into protect_definer, protect_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'protect_like_count';
  if protect_definer is not false
     or protect_src not like '%new.like_count := 0%'
     or protect_src like '%pg_trigger_depth%'
     or protect_src !~ 'search_path' and not exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and p.proname = 'protect_like_count'
         and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
     ) then
    raise exception 'protect_like_count does not zero client inserts';
  end if;

  select pg_get_triggerdef(t.oid)
  into trigger_def
  from pg_trigger t
  where t.tgname = 'posts_protect_like_count'
    and not t.tgisinternal;
  if trigger_def is null or trigger_def not ilike '%BEFORE INSERT OR UPDATE OF like_count%' then
    raise exception 'like_count guard is not BEFORE INSERT OR UPDATE OF like_count: %', trigger_def;
  end if;

  if (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'posts_protect_like_count',
        'enforce_mail_day_post',
        'enforce_mail_day_post_update',
        'likes_after_insert',
        'likes_after_delete',
        'likes_enforce_rate',
        'notifications_stamp_preview'
      )
      and tgenabled <> 'D'
  ) <> 7 then
    raise exception 'a likes trigger is missing or disabled';
  end if;

  select pg_get_triggerdef(t.oid)
  into trigger_def
  from pg_trigger t
  where t.tgname = 'enforce_mail_day_post_update'
    and not t.tgisinternal;
  if trigger_def is null or trigger_def not like '%like_count%' then
    raise exception 'mail day update trigger does not ignore like_count: %', trigger_def;
  end if;

  select has_function_privilege('authenticated', 'public.migrate_local_likes(uuid[])', 'execute')
  into migrate_auth;
  select has_function_privilege('anon', 'public.migrate_local_likes(uuid[])', 'execute')
  into migrate_anon;
  if migrate_auth is not true or migrate_anon then
    raise exception 'migrate_local_likes grants are wrong (authenticated %, anon %)', migrate_auth, migrate_anon;
  end if;

  select p.prosrc
  into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'migrate_local_likes';
  if src not like '%> 100%'
     or src not like '%likes already imported%'
     or src not like '%calls < 20%'
     or src ~* 'pg_catalog\.(nullif|coalesce|greatest|least)\s*\('
     or src ~* '(from|into|update|join)\s+(likes|posts|notifications)\M' then
    raise exception 'migrate_local_likes is missing the 100 cap, the one-shot quota, or uses an unqualified name';
  end if;

  perform set_config('app.user_id', '11111111-1111-4111-8111-111111111111', true);
  if auth.uid() = '11111111-1111-4111-8111-111111111111'::uuid then
    begin
      perform public.migrate_local_likes(array(select gen_random_uuid() from generate_series(1, 101)));
      raise exception 'oversized migrate was allowed';
    exception
      when others then
        if sqlerrm not ilike '%at most 100%' then
          raise;
        end if;
    end;
  end if;

  select p.prosrc
  into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'enforce_like_rate';
  if src is null
     or src not like '%> 300%'
     or coalesce((
       select array_to_string(p.proconfig, ',')
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'enforce_like_rate'
     ), '') not like '%search_path=%' then
    raise exception 'enforce_like_rate is missing the 300/hour cap or search_path';
  end if;

  select count(*)
  into note_inserts
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifications'
    and cmd = 'INSERT'
    and permissive = 'PERMISSIVE';
  if note_inserts <> 1 then
    raise exception 'notifications has % permissive insert policies', note_inserts;
  end if;

  select with_check
  into note_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifications'
    and policyname = 'Create notifications as yourself'
    and cmd = 'INSERT';
  if note_policy is null
     or note_policy not like '%uid()%'
     or note_policy not like '%is_blocked%'
     or note_policy not like '%notification_insert_allowed%'
     or note_policy not like '%href%'
     or note_policy not like '%metadata%'
     or note_policy not like '%reply%' then
    raise exception 'notification insert policy does not restrict the target: %', note_policy;
  end if;

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), p.prosrc
  into note_definer, note_path, note_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'notification_insert_allowed';
  if note_definer is not true or note_path not like '%search_path=%' then
    raise exception 'notification_insert_allowed must be security definer with an empty search_path';
  end if;
  if note_src not like '%like%'
     or note_src not like '%comment%'
     or note_src not like '%repost%'
     or note_src not like '%mention%'
     or note_src not like '%follow%'
     or note_src not like '%quote%'
     or note_src not like '%want_alert%'
     or note_src not like '%deal_confirm%'
     or note_src not like '%follows%'
     or note_src not like '%reposts%'
     or note_src not like '%10 minutes%' then
    raise exception 'notification_insert_allowed is missing a client kind or a backing-row check';
  end if;
  if note_src ~* 'pg_catalog\.(nullif|coalesce|greatest|least)\s*\('
     or note_src ~* '(from|into|update|join)\s+(likes|posts|notifications|follows|reposts|comments|profiles)\M' then
    raise exception 'notification_insert_allowed uses a banned pg_catalog call or an unqualified name';
  end if;

  for fn in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' and p.proname in (
        'sync_like',
        'protect_like_count',
        'notification_insert_allowed',
        'enforce_like_rate',
        'stamp_notification_preview'
      ))
      or (n.nspname = 'public' and p.proname = 'migrate_local_likes')
  loop
    select p.prosrc
    into src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = fn
      and n.nspname in ('private', 'public');
    if src ~* 'pg_catalog\.(nullif|coalesce|greatest|least)\s*\(' then
      raise exception '% schema-qualifies coalesce, nullif, greatest, or least', fn;
    end if;
  end loop;
end
$check$;

rollback;
