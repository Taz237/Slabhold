import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

const MIGRATION = "supabase/migrations/20261116130000_video_posts.sql";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const POSTER = "44444444-4444-4444-8444-444444444444";
const BASE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-videos";

function video(over: Record<string, unknown> = {}, owner = AUTHOR): string {
  return JSON.stringify({
    url: `${BASE}/${owner}/${FILE}.mov`,
    poster: `${BASE}/${owner}/${POSTER}.jpg`,
    width: 1080,
    height: 1920,
    duration: 12.4,
    mime: "video/quicktime",
    ...over,
  });
}

/** posts, comments and storage as production has them where this migration touches them. */
const setupSql = `
create schema if not exists auth;
create schema if not exists private;
create schema if not exists storage;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public, private, storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null
);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated;

create table public.profiles (id uuid primary key, username text not null);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_url text,
  meta jsonb,
  gif jsonb,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "Posts are public" on public.posts for select using (true);
create policy "Create own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Delete own posts" on public.posts for delete using (auth.uid() = user_id);
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  image_urls text[] not null default '{}',
  gif jsonb,
  created_at timestamptz not null default now(),
  constraint comments_body_len check (
    char_length(btrim(body, E' \\t\\r\\n')) <= 280
    and (
      char_length(btrim(body, E' \\t\\r\\n')) >= 1
      or cardinality(image_urls) between 1 and 4
      or gif is not null
    )
  )
);
alter table public.comments enable row level security;
create policy "Comments are public" on public.comments for select using (true);
create policy "Comment as yourself" on public.comments for insert with check (auth.uid() = user_id);
grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;

insert into public.profiles (id, username) values ('${AUTHOR}', 'author'), ('${OTHER}', 'other');
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true);
`;

/** A reason as a SQL string literal: an apostrophe ("else's") is doubled. */
function quoted(why: string) {
  return why.replace(/'/g, "''");
}

/** The statement must fail. If it goes through, the test stops with the reason. */
function fails(statement: string, why: string) {
  return `
do $$
begin
  begin
    ${statement}
    raise exception 'ALLOWED: ${quoted(why)}';
  exception
    when others then
      if sqlerrm like 'ALLOWED:%' then raise; end if;
  end;
end
$$;`;
}

function expect(condition: string, why: string) {
  return `
do $$
begin
  if not (${condition}) then raise exception 'FAILED: ${quoted(why)}'; end if;
end
$$;`;
}

const behaviorSql = `
${expect(
  "exists (select 1 from storage.buckets where id = 'post-videos' and public and file_size_limit = 104857600 and allowed_mime_types = array['video/mp4','video/quicktime','image/jpeg'])",
  "the post-videos bucket is public, capped at 100 MB, MP4/MOV/JPEG only",
)}
${expect("(select count(*) from pg_policies where schemaname = 'storage' and policyname like '%post videos') = 3", "three post-videos storage policies")}
${expect("(select count(*) from pg_policies where schemaname = 'public') = 5", "no table policy was added or changed")}

set role authenticated;
select set_config('app.user_id', '${AUTHOR}', false);

-- Storage: your own folder only.
insert into storage.objects (bucket_id, name) values ('post-videos', '${AUTHOR}/${FILE}.mov');
${fails(`insert into storage.objects (bucket_id, name) values ('post-videos', '${OTHER}/${FILE}.mov');`, "an upload into someone else's folder")}
select set_config('app.user_id', '${OTHER}', false);
${expect("not exists (select 1 from storage.objects where bucket_id = 'post-videos')", "someone else can list your videos")}
delete from storage.objects where bucket_id = 'post-videos';
select set_config('app.user_id', '${AUTHOR}', false);
${expect("exists (select 1 from storage.objects where bucket_id = 'post-videos')", "someone else deleted your video")}
delete from storage.objects where bucket_id = 'post-videos';
${expect("not exists (select 1 from storage.objects where bucket_id = 'post-videos')", "the owner could not delete their video")}

-- A post with a video, its poster kept on image_url.
insert into public.posts (user_id, content, image_url, video)
values ('${AUTHOR}', 'pull', '${BASE}/${AUTHOR}/${POSTER}.jpg', '${video()}');
insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'mp4', '${video({ url: `${BASE}/${AUTHOR}/${FILE}.mp4`, mime: "video/mp4", duration: 60.4 })}');
insert into public.posts (user_id, content) values ('${AUTHOR}', 'no video');

${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({}, OTHER)}');`, "a video in someone else's folder")}
${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({ url: "https://example.com/a.mov" })}');`, "a video hosted elsewhere")}
${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({ poster: `${BASE}/${AUTHOR}/${POSTER}.png` })}');`, "a poster that is not a jpg")}
${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({ duration: 61 })}');`, "a video over 60 seconds")}
${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({ width: 0 })}');`, "a zero width")}
${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({ mime: "video/webm" })}');`, "a webm type")}
${fails(`insert into public.posts (user_id, content, video) values ('${AUTHOR}', 'x', '${video({ extra: 1 })}');`, "an unknown key")}
${fails(`insert into public.posts (user_id, content, video, gif) values ('${AUTHOR}', 'x', '${video()}', '{"id":"a"}');`, "a video with a GIF")}
${fails(`insert into public.posts (user_id, content, video, meta) values ('${AUTHOR}', 'x', '${video()}', '{"images":["a","b"]}');`, "a video with photos")}

-- A reply can be just a video, and never a video with photos or a GIF.
insert into public.comments (post_id, user_id, body, video)
select id, '${AUTHOR}', '', '${video()}' from public.posts where content = 'no video';
insert into public.comments (post_id, user_id, body)
select id, '${AUTHOR}', 'text still works' from public.posts where content = 'no video';
${fails(`insert into public.comments (post_id, user_id, body) select id, '${AUTHOR}', '  ' from public.posts where content = 'no video';`, "an empty reply")}
${fails(`insert into public.comments (post_id, user_id, body, video, image_urls) select id, '${AUTHOR}', '', '${video()}', array['a'] from public.posts where content = 'no video';`, "a reply video with photos")}
${fails(`insert into public.comments (post_id, user_id, body, video) select id, '${AUTHOR}', '', '${video({}, OTHER)}' from public.posts where content = 'no video';`, "a reply video in someone else's folder")}
reset role;
`;

describe("video posts migration (postgres)", () => {
  const stops: (() => void)[] = [];
  after(() => {
    for (const stop of stops) stop();
  });

  it("adds the bucket, the column and its checks, and runs twice", async () => {
    const db = await startPostgres("videos-pg-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), MIGRATION), "migration");
    db.runFile(join(process.cwd(), MIGRATION), "migration again");
    db.run(behaviorSql, "behavior");
  });
});
