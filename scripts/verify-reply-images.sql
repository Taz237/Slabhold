-- Read-only check for reply photos.
-- Not a migration. Do not run supabase db push with this file.
-- transaction_read_only is on. This script does not insert, update, or
-- delete comments, follows, or storage objects.
-- URL cases call private.reply_image_urls_ok. That function does not write.

begin;

set local transaction_read_only = on;
set local lock_timeout = '5s';

do $$
declare
  col_type text;
  image_check text;
  body_check text;
  url_check text;
  owner uuid := '6d31ab97-9162-4296-876d-9e0378872fce';
  other uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  file_id text := '11111111-2222-4333-8444-555555555555';
  ok_url text;
  host text := 'https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-images/';
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
    into url_check
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'comments'
    and con.conname = 'comments_image_urls_ok';

  if url_check is null or position('reply_image_urls_ok' in url_check) = 0 then
    raise notice 'FAIL: comments_image_urls_ok is missing (%)', url_check;
  else
    raise notice 'PASS: image urls are checked against the uploader folder';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid)
    into body_check
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'comments'
    and con.conname = 'comments_body_len';

  if body_check is null
     or position('image_urls' in body_check) = 0
     or position('btrim(body,' in body_check) = 0 then
    raise notice 'FAIL: whitespace-only reply text is still allowed (%)', body_check;
  else
    raise notice 'PASS: whitespace-only text is rejected unless a reply has photos';
  end if;

  ok_url := host || owner::text || '/' || file_id || '.jpg';

  if private.reply_image_urls_ok(array[ok_url], owner) then
    raise notice 'PASS: own-folder uuid.jpg is accepted';
  else
    raise notice 'FAIL: own-folder uuid.jpg was rejected';
  end if;

  if private.reply_image_urls_ok('{}'::text[], owner) then
    raise notice 'PASS: empty image_urls is accepted';
  else
    raise notice 'FAIL: empty image_urls was rejected';
  end if;

  if private.reply_image_urls_ok(array['javascript:alert(1)'], owner) then
    raise notice 'FAIL: javascript: url was accepted';
  else
    raise notice 'PASS: javascript: url is rejected';
  end if;

  if private.reply_image_urls_ok(array['data:image/jpeg;base64,YQ=='], owner) then
    raise notice 'FAIL: data: url was accepted';
  else
    raise notice 'PASS: data: url is rejected';
  end if;

  if private.reply_image_urls_ok(array['http://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-images/' || owner::text || '/' || file_id || '.jpg'], owner) then
    raise notice 'FAIL: http: url was accepted';
  else
    raise notice 'PASS: http: url is rejected';
  end if;

  if private.reply_image_urls_ok(array['https://evil.example/storage/v1/object/public/post-images/' || owner::text || '/' || file_id || '.jpg'], owner) then
    raise notice 'FAIL: foreign host was accepted';
  else
    raise notice 'PASS: foreign host is rejected';
  end if;

  if private.reply_image_urls_ok(array['https://knuwflptobyutrauxblj.supabase.co.evil.com/storage/v1/object/public/post-images/' || owner::text || '/' || file_id || '.jpg'], owner) then
    raise notice 'FAIL: supabase.co.evil.com was accepted';
  else
    raise notice 'PASS: supabase.co.evil.com is rejected';
  end if;

  if private.reply_image_urls_ok(array[ok_url || '@evil.example'], owner) then
    raise notice 'FAIL: @ trick was accepted';
  else
    raise notice 'PASS: @ trick is rejected';
  end if;

  if private.reply_image_urls_ok(array[host || owner::text || '/../' || file_id || '.jpg'], owner) then
    raise notice 'FAIL: ../ path was accepted';
  else
    raise notice 'PASS: ../ path is rejected';
  end if;

  if private.reply_image_urls_ok(array[host || other::text || '/' || file_id || '.jpg'], owner) then
    raise notice 'FAIL: another user folder was accepted';
  else
    raise notice 'PASS: another user folder is rejected';
  end if;

  if private.reply_image_urls_ok(array[host || owner::text || '/not-a-uuid.jpg'], owner) then
    raise notice 'FAIL: non-uuid name was accepted';
  else
    raise notice 'PASS: non-uuid name is rejected';
  end if;

  if private.reply_image_urls_ok(array[
    host || owner::text || '/11111111-2222-4333-8444-555555555551.jpg',
    host || owner::text || '/11111111-2222-4333-8444-555555555552.jpg',
    host || owner::text || '/11111111-2222-4333-8444-555555555553.jpg',
    host || owner::text || '/11111111-2222-4333-8444-555555555554.jpg',
    host || owner::text || '/11111111-2222-4333-8444-555555555555.jpg'
  ], owner) then
    raise notice 'FAIL: five photos were accepted';
  else
    raise notice 'PASS: five photos are rejected';
  end if;

  if private.reply_image_urls_ok(array[ok_url, null]::text[], owner) then
    raise notice 'FAIL: NULL element was accepted';
  else
    raise notice 'PASS: NULL element is rejected';
  end if;

  if private.reply_image_urls_ok(array[ok_url, ok_url], owner) then
    raise notice 'FAIL: duplicate url was accepted';
  else
    raise notice 'PASS: duplicate url is rejected';
  end if;

  if private.reply_image_urls_ok(array[[ok_url]]::text[], owner) then
    raise notice 'FAIL: 2-D array was accepted';
  else
    raise notice 'PASS: 2-D array is rejected';
  end if;
end;
$$;

rollback;
