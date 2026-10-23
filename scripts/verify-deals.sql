-- Read-only checks for the deal log. Do not apply this file.
-- Each row is PASS or FAIL. A FAIL row means that check is not in place.
-- Safe to run after 20261023010000_deal_log.sql.

select 'deals_rls' as check_name,
  case when c.relrowsecurity then 'PASS' else 'FAIL' end as result
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'deals'

union all

select 'party_select_policy',
  case when exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'deals'
      and pol.polcmd = 'r'
  ) then 'PASS' else 'FAIL' end

union all

select 'one_pending_deal',
  case when exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'deals_one_pending_per_card'
      and indexdef like '%status = ''pending''%'
  ) then 'PASS' else 'FAIL' end

union all

select 'seller_index',
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'deals_seller_idx'
      and indexdef ilike '%created_at DESC%'
  ) then 'PASS' else 'FAIL' end

union all

select 'buyer_index',
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'deals_buyer_idx'
      and indexdef ilike '%created_at DESC%'
  ) then 'PASS' else 'FAIL' end

union all

select 'no_direct_write',
  case
    when has_table_privilege('authenticated', 'public.deals', 'SELECT')
     and not has_table_privilege('authenticated', 'public.deals', 'INSERT')
     and not has_table_privilege('authenticated', 'public.deals', 'UPDATE')
     and not has_table_privilege('anon', 'public.deals', 'INSERT')
     and not has_table_privilege('anon', 'public.deals', 'UPDATE')
    then 'PASS' else 'FAIL'
  end

union all

select 'card_id_set_null',
  case when exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'deals'
      and a.attname = 'card_id'
      and a.attnotnull = false
  ) and exists (
    select 1
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    where c.relname = 'deals'
      and con.conname = 'deals_card_id_fkey'
      and con.confdeltype = 'n'
  ) then 'PASS' else 'FAIL' end

union all

select 'card_snapshot',
  case when (
    select count(*)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'deals'
      and a.attname in ('card_player', 'card_year', 'card_set', 'card_number', 'card_parallel')
      and a.attnum > 0
      and not a.attisdropped
  ) = 5 then 'PASS' else 'FAIL' end

union all

select 'price_cap',
  case when exists (
    select 1
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    where c.relname = 'deals'
      and con.conname = 'deals_price_cents'
      and pg_get_constraintdef(con.oid) like '%100000000%'
  ) then 'PASS' else 'FAIL' end

union all

select 'empty_search_path',
  case when (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('private', 'reject_direct_deal_write'),
      ('private', 'reject_direct_sold_write'),
      ('private', 'cancel_pending_deals_for_card'),
      ('private', 'create_deal'),
      ('private', 'respond_deal'),
      ('private', 'cancel_deal'),
      ('public', 'create_deal'),
      ('public', 'respond_deal'),
      ('public', 'cancel_deal')
    )
    and exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg in ('search_path=', 'search_path=""')
    )
  ) = 9 then 'PASS' else 'FAIL' end

union all

select 'block_on_create',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'create_deal'
      and p.prosecdef
      and p.prosrc like '%private.is_blocked(v_seller, p_buyer_id)%'
      and p.prosrc like '%not allowed%'
  ) then 'PASS' else 'FAIL' end

union all

select 'block_before_confirm',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'respond_deal'
      and p.prosecdef
      and position('return ''declined''' in p.prosrc) > 0
      and position('private.is_blocked' in p.prosrc) > position('return ''declined''' in p.prosrc)
      and position('status = ''cancelled''' in p.prosrc) > position('private.is_blocked' in p.prosrc)
      and position('return ''already sold''' in p.prosrc) > position('status = ''cancelled''' in p.prosrc)
      and position('raise exception ''already sold''' in p.prosrc) = 0
  ) then 'PASS' else 'FAIL' end

union all

select 'hourly_limit',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'create_deal'
      and p.prosrc like '%v_recent >= 5%'
      and p.prosrc like '%interval ''1 hour''%'
      and p.prosrc like '%pg_advisory_xact_lock%'
  ) then 'PASS' else 'FAIL' end

union all

select 'sold_column_guard',
  case when exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'cards'
      and t.tgname = 'cards_reject_direct_sold_write'
      and not t.tgisinternal
      and p.proname = 'reject_direct_sold_write'
      and (t.tgtype & 4) = 4
      and (t.tgtype & 16) = 16
  ) then 'PASS' else 'FAIL' end

union all

select 'pending_cancelled_on_card_delete',
  case when exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'cards'
      and t.tgname = 'cards_cancel_pending_deals'
      and not t.tgisinternal
      and p.prosecdef
      and p.proname = 'cancel_pending_deals_for_card'
  ) then 'PASS' else 'FAIL' end

union all

select 'public_cards_deal_sold_only',
  case when exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'public_cards'
      and pg_get_viewdef(c.oid, true) ilike '%sold_at is null%'
      and pg_get_viewdef(c.oid, true) not ilike '%sell_price is null%'
  ) then 'PASS' else 'FAIL' end

union all

select 'no_qualified_coalesce',
  case
    when (
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.proname in (
          'reject_direct_deal_write',
          'reject_direct_sold_write',
          'cancel_pending_deals_for_card',
          'create_deal',
          'respond_deal',
          'cancel_deal'
        )
    ) >= 9
    and not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.proname in (
          'reject_direct_deal_write',
          'reject_direct_sold_write',
          'cancel_pending_deals_for_card',
          'create_deal',
          'respond_deal',
          'cancel_deal'
        )
        and (
          p.prosrc like '%pg_catalog.coalesce(%'
          or p.prosrc like '%pg_catalog.nullif(%'
          or p.prosrc like '%pg_catalog.greatest(%'
          or p.prosrc like '%pg_catalog.least(%'
        )
    )
    then 'PASS' else 'FAIL'
  end

order by 1;
