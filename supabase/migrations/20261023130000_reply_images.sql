-- Photo replies. Not applied. Do not run supabase db push until reviewed.
-- comments.image_urls holds 0 to 4 photo URLs owned by the reply author.
-- Text may be empty only when at least one photo is stored.
-- Whitespace-only text with no photo is rejected.
-- Existing comment policies stay as they are.
-- Uploads reuse the post-images bucket: post-images/<user id>/<uuid>.<jpg|png|webp>.

begin;

set local lock_timeout = '5s';

alter table public.comments
  add column if not exists image_urls text[] not null default '{}';

alter table public.comments drop constraint if exists comments_image_urls_len;
alter table public.comments
  add constraint comments_image_urls_len
  check (cardinality(image_urls) between 0 and 4);

-- text[] does not force one dimension. array_ndims('{}') is null, so the
-- default empty array still passes. A 2-D array does not.
create or replace function private.reply_image_urls_ok(urls text[], owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select urls is not null
    and owner is not null
    and (pg_catalog.array_ndims(urls) is null or pg_catalog.array_ndims(urls) = 1)
    and pg_catalog.cardinality(urls) <= 4
    and pg_catalog.array_position(urls, null) is null
    and not exists (
      select 1 from pg_catalog.unnest(urls) as u(url)
      where u.url !~ ('^https://knuwflptobyutrauxblj\.supabase\.co/storage/v1/object/public/post-images/'
                      || owner::text
                      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
    )
    and (select pg_catalog.count(distinct u.url) from pg_catalog.unnest(urls) as u(url)) = pg_catalog.cardinality(urls);
$$;

grant execute on function private.reply_image_urls_ok(text[], uuid) to anon, authenticated, service_role;

alter table public.comments drop constraint if exists comments_image_urls_ok;
alter table public.comments
  add constraint comments_image_urls_ok
  check (private.reply_image_urls_ok(image_urls, user_id));

alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments
  add constraint comments_body_len
  check (
    char_length(btrim(body, E' \t\r\n')) <= 280
    and (
      char_length(btrim(body, E' \t\r\n')) >= 1
      or cardinality(image_urls) between 1 and 4
    )
  );

commit;
