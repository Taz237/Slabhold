-- Photo replies. Not applied. Do not run supabase db push until reviewed.
-- comments.image_urls holds 0 to 4 photo URLs. Text may be empty only when
-- at least one photo is stored. Existing comment policies stay as they are.
-- Uploads reuse the post-images bucket, whose insert path is the uploader's folder.

begin;

set local lock_timeout = '5s';

alter table public.comments
  add column if not exists image_urls text[] not null default '{}';

alter table public.comments drop constraint if exists comments_image_urls_len;
alter table public.comments
  add constraint comments_image_urls_len
  check (cardinality(image_urls) between 0 and 4);

alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments
  add constraint comments_body_len
  check (
    char_length(body) <= 280
    and (
      char_length(btrim(body)) >= 1
      or cardinality(image_urls) between 1 and 4
    )
  );

commit;
