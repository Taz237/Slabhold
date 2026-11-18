import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

const MIGRATION = "supabase/migrations/20261114120000_gif_posts_and_threads.sql";

/**
 * The word filter the migration calls (private.blocked_text), as written in
 * the reviewed safety guards file. Only the filter functions are taken, not
 * that file's triggers.
 */
function wordFilterSql(): string {
  const source = readFileSync(join(process.cwd(), "docs/appstore-blockers-1/proposed-safety-guards.sql"), "utf8");
  const start = source.indexOf("create or replace function private.filter_normalise");
  const blocked = source.indexOf("create or replace function private.blocked_text");
  const end = source.indexOf("\n$$;", blocked);
  if (start < 0 || blocked < start || end < 0) throw new Error("word filter functions not found");
  return source.slice(start, end + "\n$$;".length);
}

/** A word the filter blocks, read from the filter itself so none is written here. */
const BLOCKED_WORD = /plain_words constant text\[\] := array\[\s*'([^']+)'/.exec(wordFilterSql())?.[1] ?? "";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THIRD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** posts and comments as production has them where this migration touches them. */
const setupSql = `
create schema if not exists auth;
create schema if not exists private;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public, private to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, username text not null);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_url text,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "Posts are public" on public.posts for select using (hidden_at is null or auth.uid() = user_id);
create policy "Create own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Update own posts" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own posts" on public.posts for delete using (auth.uid() = user_id);
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint comments_body_len check (
    char_length(btrim(body, E' \\t\\r\\n')) <= 280
    and (char_length(btrim(body, E' \\t\\r\\n')) >= 1 or cardinality(image_urls) between 1 and 4)
  )
);
alter table public.comments enable row level security;
create policy "Comments are public" on public.comments for select using (true);
create policy "Comment as yourself" on public.comments for insert with check (auth.uid() = user_id);
grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;

insert into public.profiles (id, username) values ('${AUTHOR}', 'author'), ('${OTHER}', 'other');

${wordFilterSql()}
`;

const GIF = `{"id":"abc123","mp4":"https://media2.giphy.com/media/v1.Y2lk/abc123/200w.mp4?cid=1&rid=200w.mp4&ct=g","still":"https://media2.giphy.com/media/abc123/200w_s.gif","width":200,"height":113,"title":"Nice pull"}`;

/** The statement must fail. If it goes through, the test stops with the reason. */
function fails(statement: string, why: string) {
  return `
do $$
begin
  begin
    ${statement}
    raise exception 'ALLOWED: ${why}';
  exception
    when others then
      if sqlerrm like 'ALLOWED:%' then raise; end if;
  end;
end
$$;`;
}

function threadIs(threadId: string, expected: string, why: string) {
  return `
do $$
declare
  got text;
begin
  select string_agg(content || ':' || thread_position, ',' order by thread_position)
  into got from public.posts where thread_id = '${threadId}';
  if got is distinct from '${expected}' then
    raise exception '${why}: %', got;
  end if;
end
$$;`;
}

const behaviorSql = `
set role authenticated;
select set_config('app.user_id', '${AUTHOR}', false);

-- A thread goes in as one insert and reads back in order.
insert into public.posts (user_id, content, thread_id, thread_position) values
  ('${AUTHOR}', 'one', '${THREAD}', 0),
  ('${AUTHOR}', 'two', '${THREAD}', 1),
  ('${AUTHOR}', 'three', '${THREAD}', 2),
  ('${AUTHOR}', 'four', '${THREAD}', 3);
${threadIs(THREAD, "one:0,two:1,three:2,four:3", "the thread did not read back in order")}

${fails(`insert into public.posts (user_id, content, thread_id, thread_position) values ('${AUTHOR}', 'solo', '${SECOND}', 0);`, "a thread of one post")}
${fails(`insert into public.posts (user_id, content, thread_id, thread_position) values ('${AUTHOR}', 'a', '${SECOND}', 0), ('${AUTHOR}', 'b', '${SECOND}', 2);`, "a thread with a gap")}
${fails(`insert into public.posts (user_id, content, thread_id, thread_position) values ('${AUTHOR}', 'a', '${SECOND}', 0), ('${AUTHOR}', 'b', '${SECOND}', 0);`, "two posts in one place")}
${fails(`insert into public.posts (user_id, content, thread_id) values ('${AUTHOR}', 'a', '${SECOND}');`, "a thread id with no position")}
${fails(`insert into public.posts (user_id, content, thread_id, thread_position) select '${AUTHOR}', 'n', '${SECOND}', n from generate_series(0, 10) n;`, "an 11-post thread")}

-- A client cannot move a post inside its thread or out of it.
update public.posts set thread_position = 9, thread_id = '${SECOND}' where content = 'two';
${threadIs(THREAD, "one:0,two:1,three:2,four:3", "a client moved a post within a thread")}

-- Another account cannot add to this thread or delete from it.
select set_config('app.user_id', '${OTHER}', false);
${fails(`insert into public.posts (user_id, content, thread_id, thread_position) values ('${OTHER}', 'mine now', '${THREAD}', 4);`, "another account joined the thread")}
delete from public.posts where content = 'two';
${threadIs(THREAD, "one:0,two:1,three:2,four:3", "another account deleted a thread post")}

-- Deleting one post in the middle leaves the others, in order, with no gap.
select set_config('app.user_id', '${AUTHOR}', false);
delete from public.posts where content = 'two';
${threadIs(THREAD, "one:0,three:1,four:2", "deleting one post did not leave the others in order")}

-- Deleting the first post: the next one leads the thread.
delete from public.posts where content = 'one';
${threadIs(THREAD, "three:0,four:1", "deleting the first post did not promote the next")}

-- One post left: it is a normal post again.
delete from public.posts where content = 'four';
do $$
begin
  if (select count(*) from public.posts where content = 'three' and thread_id is null and thread_position is null) <> 1 then
    raise exception 'the last post of a thread did not become a normal post';
  end if;
end
$$;

-- Deleting 2 posts of one thread in a single statement renumbers cleanly.
insert into public.posts (user_id, content, thread_id, thread_position) values
  ('${AUTHOR}', 'm1', '${THIRD}', 0),
  ('${AUTHOR}', 'm2', '${THIRD}', 1),
  ('${AUTHOR}', 'm3', '${THIRD}', 2),
  ('${AUTHOR}', 'm4', '${THIRD}', 3),
  ('${AUTHOR}', 'm5', '${THIRD}', 4),
  ('${AUTHOR}', 'm6', '${THIRD}', 5);
-- Two from the middle, not next to each other.
delete from public.posts where content in ('m2', 'm4');
${threadIs(THIRD, "m1:0,m3:1,m5:2,m6:3", "deleting two posts in one statement left a gap")}
-- The first two together: the third leads.
delete from public.posts where content in ('m1', 'm3');
${threadIs(THIRD, "m5:0,m6:1", "deleting the first two posts in one statement did not renumber")}
-- Three posts, two deleted at once: the one left is a normal post.
insert into public.posts (user_id, content, thread_id, thread_position) values
  ('${AUTHOR}', 'n1', '${SECOND}', 0), ('${AUTHOR}', 'n2', '${SECOND}', 1), ('${AUTHOR}', 'n3', '${SECOND}', 2);
delete from public.posts where content in ('n1', 'n3');
do $$
begin
  if (select count(*) from public.posts where content = 'n2' and thread_id is null and thread_position is null) <> 1 then
    raise exception 'two posts deleted at once did not leave the last one as a normal post';
  end if;
end
$$;
-- A whole thread in one statement.
delete from public.posts where thread_id = '${THIRD}';
do $$
begin
  if exists (select 1 from public.posts where content in ('m5', 'm6')) then
    raise exception 'deleting a whole thread in one statement left posts behind';
  end if;
end
$$;
delete from public.posts where content = 'n2';

-- GIFs: a GIPHY GIF is stored, anything else is refused.
insert into public.posts (user_id, content, gif) values ('${AUTHOR}', '', '${GIF}');
insert into public.comments (post_id, user_id, body, gif)
  select id, '${AUTHOR}', '', '${GIF}' from public.posts where content = 'three';
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', jsonb_set('${GIF}', '{mp4}', '"https://evil.example/x.mp4"'));`, "a GIF from another host")}
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', jsonb_set('${GIF}', '{still}', '"https://media.giphy.com.evil.example/x.gif"'));`, "a look-alike host")}
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', jsonb_set('${GIF}', '{mp4}', '"https://media.giphy.com/media/../x.mp4"'));`, "a path with ..")}
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', '${GIF}'::jsonb || '{"extra":1}');`, "an unknown key")}
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', '${GIF}'::jsonb - 'still');`, "a GIF with no still")}
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', '"https://media.giphy.com/media/x/giphy.mp4"');`, "a GIF that is not an object")}
${fails(`insert into public.comments (post_id, user_id, body) select id, '${AUTHOR}', '  ' from public.posts limit 1;`, "an empty reply")}

-- A GIF title goes through the same word filter as post text.
${fails(`insert into public.posts (user_id, gif) values ('${AUTHOR}', jsonb_set('${GIF}', '{title}', to_jsonb('a ${BLOCKED_WORD} title'::text)));`, "a post GIF with a blocked title")}
${fails(`insert into public.comments (post_id, user_id, body, gif) select id, '${AUTHOR}', 'hi', jsonb_set('${GIF}', '{title}', to_jsonb('a ${BLOCKED_WORD} title'::text)) from public.posts limit 1;`, "a reply GIF with a blocked title")}
${fails(`update public.posts set gif = jsonb_set(gif, '{title}', to_jsonb('a ${BLOCKED_WORD} title'::text)) where gif is not null; if not found then raise exception 'no row'; end if;`, "an edit to a blocked GIF title")}
insert into public.posts (user_id, content, gif) values ('${AUTHOR}', 'no title', '${GIF}'::jsonb - 'title');
update public.posts set content = 'still fine' where content = 'no title';
delete from public.posts where content = 'still fine';

-- Other accounts read the new columns as they read the post, and cannot write them.
select set_config('app.user_id', '${OTHER}', false);
update public.posts set gif = null where gif is not null;
do $$
begin
  if (select count(*) from public.posts where gif is not null) <> 1 then
    raise exception 'another account could not read, or could edit, a GIF post';
  end if;
end
$$;

reset role;

-- A hidden post still holds its place in the thread.
insert into public.posts (user_id, content, thread_id, thread_position) values
  ('${AUTHOR}', 'h1', '${SECOND}', 0), ('${AUTHOR}', 'h2', '${SECOND}', 1), ('${AUTHOR}', 'h3', '${SECOND}', 2);
update public.posts set hidden_at = now() where content = 'h1';
set role authenticated;
select set_config('app.user_id', '${OTHER}', false);
${fails(`insert into public.posts (user_id, content, thread_id, thread_position) values ('${OTHER}', 'x', '${SECOND}', 3);`, "another account joined a thread whose first post is hidden")}
reset role;

-- Deleting the account deletes its threads without error.
delete from public.profiles where id = '${AUTHOR}';
do $$
begin
  if exists (select 1 from public.posts) then
    raise exception 'posts were left behind';
  end if;
end
$$;
`;

describe("GIF posts and threads migration", () => {
  const stops: Array<() => void> = [];
  after(() => {
    for (const stop of stops) stop();
  });

  it("keeps a thread in order, renumbers cleanly when one or several posts are deleted, and only stores clean GIPHY GIFs", async () => {
    assert.ok(BLOCKED_WORD, "a blocked word to test with");
    const db = await startPostgres("threads-pg-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), MIGRATION), "migration");
    db.run(behaviorSql, "behavior");
  });

  it("runs twice without error", async () => {
    const db = await startPostgres("threads-pg-twice-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), MIGRATION), "migration");
    db.runFile(join(process.cwd(), MIGRATION), "migration again");
  });
});
