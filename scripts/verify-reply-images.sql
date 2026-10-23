-- Read-only check for reply photos.
-- Not a migration. Do not run supabase db push with this file.
-- transaction_read_only is on. This script does not insert, update, or
-- delete comments, follows, or storage objects.

begin;

set local transaction_read_only = on;
set local lock_timeout = '5s';

do $$
declare
  col_type text;
  image_check text;
  body_check text;
begin
  select c.data_type
    into col_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'comments'
    and c.column_name = 'image_urls';

  if col_type is distinct from 'ARRAY' then
    raise notice 'FAIL: public.comments.image_urls is missing (%)', col_type;
  else
    raise notice 'PASS: public.comments.image_urls exists';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid)
    into image_check
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'comments'
    and con.conname = 'comments_image_urls_len';

  if image_check is null
     or position('image_urls' in image_check) = 0
     or position('4' in image_check) = 0 then
    raise notice 'FAIL: comments_image_urls_len is missing (%)', image_check;
  else
    raise notice 'PASS: image_urls length is capped at 4';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid)
    into body_check
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'comments'
    and con.conname = 'comments_body_len';

  if body_check is null or position('image_urls' in body_check) = 0 then
    raise notice 'FAIL: photo-only replies are still rejected (%)', body_check;
  else
    raise notice 'PASS: empty text is allowed when a reply has photos';
  end if;
end;
$$;

rollback;
