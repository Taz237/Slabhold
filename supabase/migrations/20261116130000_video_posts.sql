-- APPLIED to prod Nov 16, 2026 (QA-fixed version). Do not re-run.
-- Do not run supabase db push. Do not apply this with the Supabase CLI.
--
-- Video posts.
--
-- 1. Storage. A new public bucket, post-videos, set up like post-images:
--    - Files sit at post-videos/<user id>/<uuid>.mp4|mov (the video) and
--      post-videos/<user id>/<uuid>.jpg (its poster frame).
--    - Public bucket: a file loads from its direct public URL, the same way
--      post photos do (every Slabhold post is public). No public select
--      policy, so nobody can list the bucket.
--    - Insert: signed-in users, into their own <user id>/ folder only.
--    - Select and delete: the owner, in their own folder only. Storage needs
--      both to remove a file, so deleting a post can delete its video.
--    - The bucket refuses anything over 100 MB and anything that is not
--      MP4, MOV or a JPEG poster.
--
-- 2. posts.video and comments.video hold one video as
--    { url, poster, width, height, duration, mime }. A check constraint only
--    accepts this project's post-videos URLs inside the author's own folder,
--    a size between 1 and 8192, a length up to 60 seconds (60.5 allows for
--    rounding) and an MP4 or MOV type.
--
-- 3. A post or reply has photos, a GIF or a video, never a mix.
--
-- 4. comments_body_len is replaced so a reply can be just a video. Same rule
--    as before (text 1 to 280, or photos, or a GIF), plus: or a video.
--
-- RLS: no table policy is added or changed. The new columns sit on
-- public.posts and public.comments, so the existing policies cover them.
-- No notification or post policy is touched. Only storage.objects gets three
-- new policies, all scoped to bucket_id = 'post-videos'.
--
-- Safe to run twice.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-videos',
  'post-videos',
  true,
  104857600,
  array['video/mp4', 'video/quicktime', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload post videos" on storage.objects;
create policy "Users can upload post videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    -- QA fix 1: only <uid>/<uuid>.mp4|mov|jpg, the names the app writes.
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|jpg)$'
    )
  );

drop policy if exists "Users can view own post videos" on storage.objects;
create policy "Users can view own post videos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'post-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own post videos" on storage.objects;
create policy "Users can delete own post videos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- 2. The video column
-- ---------------------------------------------------------------------------

create or replace function private.post_video_url_ok(url text, owner uuid, kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    url is not null
    and owner is not null
    and pg_catalog.char_length(url) <= 600
    and url ~ (
      '^https://knuwflptobyutrauxblj\.supabase\.co/storage/v1/object/public/post-videos/'
      || owner::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'
      || case when kind = 'poster' then 'jpg' else '(mp4|mov)' end
      || '$'
    ),
    false
  );
$$;

create or replace function private.post_video_ok(video jsonb, owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select video is null or coalesce(
    pg_catalog.jsonb_typeof(video) = 'object'
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(video) as k(name)
      where k.name not in ('url', 'poster', 'width', 'height', 'duration', 'mime')
    )
    and pg_catalog.jsonb_typeof(video -> 'url') = 'string'
    and private.post_video_url_ok(video ->> 'url', owner, 'video')
    and pg_catalog.jsonb_typeof(video -> 'poster') = 'string'
    and private.post_video_url_ok(video ->> 'poster', owner, 'poster')
    and pg_catalog.jsonb_typeof(video -> 'width') = 'number'
    and (video ->> 'width')::numeric between 1 and 8192
    and pg_catalog.jsonb_typeof(video -> 'height') = 'number'
    and (video ->> 'height')::numeric between 1 and 8192
    and pg_catalog.jsonb_typeof(video -> 'duration') = 'number'
    and (video ->> 'duration')::numeric > 0
    and (video ->> 'duration')::numeric <= 60.5
    and pg_catalog.jsonb_typeof(video -> 'mime') = 'string'
    and (video ->> 'mime') in ('video/mp4', 'video/quicktime'),
    false
  );
$$;

grant execute on function private.post_video_url_ok(text, uuid, text) to anon, authenticated, service_role;
grant execute on function private.post_video_ok(jsonb, uuid) to anon, authenticated, service_role;

alter table public.posts add column if not exists video jsonb;
alter table public.posts drop constraint if exists posts_video_ok;
alter table public.posts add constraint posts_video_ok check (private.post_video_ok(video, user_id));

alter table public.comments add column if not exists video jsonb;
alter table public.comments drop constraint if exists comments_video_ok;
alter table public.comments add constraint comments_video_ok check (private.post_video_ok(video, user_id));

-- ---------------------------------------------------------------------------
-- 3. Photos, a GIF or a video, never a mix
-- ---------------------------------------------------------------------------

-- A video post keeps its poster on posts.image_url (for link previews), so
-- only the GIF and the extra photos in meta.images are ruled out here.
alter table public.posts drop constraint if exists posts_video_alone;
alter table public.posts
  add constraint posts_video_alone
  check (
    video is null
    or (
      gif is null
      and not (coalesce(meta, '{}'::jsonb) ? 'images')
      -- QA fix 2: the only picture a video post keeps is its own poster.
      and (image_url is null or image_url = video ->> 'poster')
    )
  );

alter table public.comments drop constraint if exists comments_video_alone;
alter table public.comments
  add constraint comments_video_alone
  check (video is null or (gif is null and cardinality(image_urls) = 0));

-- ---------------------------------------------------------------------------
-- 4. A reply can be just a video
-- ---------------------------------------------------------------------------

alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments
  add constraint comments_body_len
  check (
    char_length(btrim(body, E' \t\r\n')) <= 280
    and (
      char_length(btrim(body, E' \t\r\n')) >= 1
      or cardinality(image_urls) between 1 and 4
      or gif is not null
      or video is not null
    )
  );

commit;
