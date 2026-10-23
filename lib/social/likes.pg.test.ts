import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const databaseUrl = process.env.LIKES_TEST_DATABASE_URL ?? "";
const ci = process.env.CI === "true" || Boolean(process.env.GITHUB_ACTIONS);
const migrationPath = join(process.cwd(), "supabase/migrations/20261023120000_likes.sql");
const verifyPath = join(process.cwd(), "scripts/verify-likes.sql");

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const LIKER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const VISIBLE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HIDDEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUIET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function psql(sqlOrFile: { sql: string } | { file: string }) {
  const dir = mkdtempSync(join(tmpdir(), "likes-pg-"));
  const file = "file" in sqlOrFile ? sqlOrFile.file : join(dir, "script.sql");
  if ("sql" in sqlOrFile) writeFileSync(file, sqlOrFile.sql);
  const result = spawnSync(
    "psql",
    ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-f", file],
    { encoding: "utf8" },
  );
  rmSync(dir, { recursive: true, force: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
  }
}

function requireLocalLikesDatabase() {
  assert.ok(databaseUrl, "LIKES_TEST_DATABASE_URL is required in CI");
  const parsed = new URL(databaseUrl);
  const name = parsed.pathname.replace(/^\//, "");
  assert.equal(name, "likes_test");
  assert.ok(
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1",
    "likes tests only run against local Postgres",
  );
}

const fixture = `
do $guard$
begin
  if current_database() <> 'likes_test' then
    raise exception 'refusing to touch database %', current_database();
  end if;
  if current_setting('server_version_num')::int < 170000
     or current_setting('server_version_num')::int >= 180000 then
    raise exception 'expected Postgres 17, got %', current_setting('server_version');
  end if;
end
$guard$;

drop schema if exists public cascade;
drop schema if exists private cascade;
drop schema if exists auth cascade;
create schema auth;
create schema public;
create schema private;
grant usage on schema public to public;
create extension if not exists pgcrypto;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$roles$;

grant anon to current_user;
grant authenticated to current_user;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated, public;
grant usage on schema private to anon, authenticated;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.user_role', true), '');
$$;

grant execute on function auth.uid() to anon, authenticated, public;
grant execute on function auth.role() to anon, authenticated, public;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default ''
);

create table public.posts (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  post_id uuid references public.posts (id) on delete set null,
  preview text,
  created_at timestamptz not null default now(),
  check (actor_id is null or actor_id <> recipient_id)
);

create unique index notifications_like_once
  on public.notifications (actor_id, post_id)
  where kind = 'like' and post_id is not null;

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from a
     and auth.uid() is distinct from b then
    raise exception 'permission denied for function is_blocked'
      using errcode = '42501';
  end if;

  return a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
end;
$$;

create or replace function private.post_author(post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.posts where id = post_id;
$$;

revoke all on function private.is_blocked(uuid, uuid) from public;
revoke all on function private.post_author(uuid) from public;
grant execute on function private.is_blocked(uuid, uuid) to anon, authenticated;
grant execute on function private.post_author(uuid) to authenticated;

alter table public.posts enable row level security;
create policy "Posts are public" on public.posts
  for select using (
    (
      hidden_at is null
      or user_id = auth.uid()
      or coalesce(auth.role(), '') = 'service_role'
    )
    and not private.is_blocked(auth.uid(), user_id)
  );

grant select on public.posts to anon, authenticated;

insert into auth.users (id) values ('${AUTHOR}'), ('${LIKER}'), ('${OTHER}');
insert into public.profiles (id, username, display_name) values
  ('${AUTHOR}', 'author', 'Author'),
  ('${LIKER}', 'liker', 'Liker'),
  ('${OTHER}', 'other', 'Other');
insert into public.posts (id, user_id, content, hidden_at) values
  ('${VISIBLE}', '${AUTHOR}', repeat('a', 90), null),
  ('${HIDDEN}', '${AUTHOR}', 'hidden post', now()),
  ('${QUIET}', '${OTHER}', '   ', null);
`;

const behavior = `
begin;

do $guard$
begin
  if current_database() <> 'likes_test' then
    raise exception 'refusing to touch database %', current_database();
  end if;
end
$guard$;

grant update on public.posts to authenticated;
drop policy if exists posts_test_update on public.posts;
create policy posts_test_update on public.posts for update using (true) with check (true);

select set_config('app.user_id', '${LIKER}', true);
select set_config('app.user_role', 'authenticated', true);
set local role authenticated;

insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');

reset role;
do $check$
declare
  cnt int;
  notes int;
  preview text;
begin
  select like_count into cnt from public.posts where id = '${VISIBLE}';
  if cnt <> 1 then raise exception 'insert count %, expected 1', cnt; end if;
  select count(*), max(notifications.preview) into notes, preview
  from public.notifications
  where kind = 'like' and post_id = '${VISIBLE}' and actor_id = '${LIKER}';
  if notes <> 1 then raise exception 'like notification count %', notes; end if;
  if preview is null or char_length(preview) <> 78 or right(preview, 1) <> '…' then
    raise exception 'preview %', preview;
  end if;
end
$check$;

set local role authenticated;
delete from public.likes where post_id = '${VISIBLE}' and user_id = '${LIKER}';
reset role;
do $check$
declare
  cnt int;
  notes int;
begin
  select like_count into cnt from public.posts where id = '${VISIBLE}';
  if cnt <> 0 then raise exception 'delete count %, expected 0', cnt; end if;
  select count(*) into notes from public.notifications
  where kind = 'like' and post_id = '${VISIBLE}' and actor_id = '${LIKER}';
  if notes <> 0 then raise exception 'notification survived unlike'; end if;
end
$check$;

update public.posts set like_count = 0 where id = '${VISIBLE}';
insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');
update public.posts set like_count = 0 where id = '${VISIBLE}';
delete from public.likes where post_id = '${VISIBLE}' and user_id = '${LIKER}';
do $check$
declare
  cnt int;
begin
  select like_count into cnt from public.posts where id = '${VISIBLE}';
  if cnt <> 0 then raise exception 'like_count floored to %, expected 0', cnt; end if;
end
$check$;

insert into public.blocks (blocker_id, blocked_id) values ('${AUTHOR}', '${LIKER}');
set local role authenticated;
do $check$
begin
  insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');
  raise exception 'like was allowed while the author blocked the liker';
exception
  when insufficient_privilege then
    null;
end
$check$;
reset role;
delete from public.blocks;
insert into public.blocks (blocker_id, blocked_id) values ('${LIKER}', '${AUTHOR}');
set local role authenticated;
do $check$
begin
  insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');
  raise exception 'like was allowed while the liker blocked the author';
exception
  when insufficient_privilege then
    null;
end
$check$;
reset role;
delete from public.blocks;

insert into public.likes (post_id, user_id, suppress_notify)
values ('${HIDDEN}', '${LIKER}', true);
set local role authenticated;
select set_config('app.user_id', '${OTHER}', true);
do $check$
declare
  seen int;
begin
  select count(*) into seen from public.likes where post_id = '${HIDDEN}';
  if seen <> 0 then raise exception 'hidden post like was visible to someone else'; end if;
end
$check$;
select set_config('app.user_id', '${AUTHOR}', true);
do $check$
declare
  seen int;
begin
  select count(*) into seen from public.likes where post_id = '${HIDDEN}';
  if seen <> 1 then raise exception 'author could not see the like on their hidden post'; end if;
end
$check$;
set local role anon;
select set_config('app.user_id', '', true);
select set_config('app.user_role', 'anon', true);
do $check$
declare
  seen int;
begin
  select count(*) into seen from public.likes where post_id = '${HIDDEN}';
  if seen <> 0 then raise exception 'anon saw a like on a hidden post'; end if;
end
$check$;
do $check$
begin
  insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');
  raise exception 'anon insert was allowed';
exception
  when insufficient_privilege then
    null;
end
$check$;
reset role;
select set_config('app.user_role', 'authenticated', true);
delete from public.likes where post_id = '${HIDDEN}';

select set_config('app.user_id', '${AUTHOR}', true);
set local role authenticated;
insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${AUTHOR}');
reset role;
do $check$
declare
  notes int;
  cnt int;
begin
  select count(*) into notes from public.notifications
  where kind = 'like' and post_id = '${VISIBLE}' and actor_id = '${AUTHOR}';
  if notes <> 0 then raise exception 'self-like created a notification'; end if;
  select like_count into cnt from public.posts where id = '${VISIBLE}';
  if cnt <> 1 then raise exception 'self-like count %, expected 1', cnt; end if;
end
$check$;
delete from public.likes where post_id = '${VISIBLE}' and user_id = '${AUTHOR}';

insert into public.notifications (recipient_id, actor_id, kind, post_id, preview)
values ('${AUTHOR}', '${LIKER}', 'like', '${VISIBLE}', 'already');
select set_config('app.user_id', '${LIKER}', true);
set local role authenticated;
insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');
reset role;
do $check$
declare
  notes int;
begin
  select count(*) into notes from public.notifications
  where kind = 'like' and post_id = '${VISIBLE}' and actor_id = '${LIKER}';
  if notes <> 1 then raise exception 'like notification was duplicated (% )', notes; end if;
end
$check$;
delete from public.likes where post_id = '${VISIBLE}' and user_id = '${LIKER}';

set local role authenticated;
do $check$
declare
  inserted int;
begin
  select count(*) into inserted from public.migrate_local_likes(array['${QUIET}']::uuid[]);
  if inserted <> 1 then raise exception 'migrate inserted %', inserted; end if;
  select count(*) into inserted from public.migrate_local_likes(array['${QUIET}']::uuid[]);
  if inserted <> 0 then raise exception 'migrate conflict inserted %', inserted; end if;
end
$check$;
reset role;
do $check$
declare
  cnt int;
  notes int;
  flagged boolean;
begin
  select like_count into cnt from public.posts where id = '${QUIET}';
  if cnt <> 1 then raise exception 'migrated count %, expected 1', cnt; end if;
  select count(*) into notes from public.notifications
  where kind = 'like' and post_id = '${QUIET}';
  if notes <> 0 then raise exception 'migrated like notified'; end if;
  select suppress_notify into flagged from public.likes
  where post_id = '${QUIET}' and user_id = '${LIKER}';
  if flagged is not true then raise exception 'migrated row did not suppress notify'; end if;
end
$check$;
set local role authenticated;

do $check$
begin
  insert into public.likes (post_id, user_id, suppress_notify)
  values ('${VISIBLE}', '${LIKER}', true);
  raise exception 'client suppress_notify insert was allowed';
exception
  when insufficient_privilege then
    null;
end
$check$;

insert into public.likes (post_id, user_id) values ('${VISIBLE}', '${LIKER}');
reset role;
do $check$
declare
  notes int;
  preview text;
begin
  select count(*), max(notifications.preview) into notes, preview
  from public.notifications
  where kind = 'like' and post_id = '${VISIBLE}' and actor_id = '${LIKER}';
  if notes <> 1 then raise exception 'normal like notifications %', notes; end if;
  if preview is null or right(preview, 1) <> '…' then
    raise exception 'normal preview %', preview;
  end if;
end
$check$;

set local role authenticated;
do $check$
begin
  update public.likes set created_at = now() where user_id = '${LIKER}';
  raise exception 'like update was allowed';
exception
  when insufficient_privilege then
    null;
end
$check$;

do $check$
declare
  got int;
begin
  update public.posts set like_count = 99 where id = '${VISIBLE}' returning like_count into got;
  if got is null then raise exception 'like_count update did not run'; end if;
  if got = 99 then raise exception 'authenticated user changed like_count'; end if;
end
$check$;

do $check$
begin
  perform public.migrate_local_likes(array(select gen_random_uuid() from generate_series(1, 101)));
  raise exception 'oversized migrate was allowed';
exception
  when others then
    if sqlerrm not ilike '%at most 100%' then
      raise;
    end if;
end
$check$;

do $check$
declare
  n int;
begin
  select count(*) into n from public.migrate_local_likes('{}'::uuid[]);
  if n <> 0 then raise exception 'empty migrate returned %', n; end if;
end
$check$;

set local role anon;
do $check$
begin
  perform public.migrate_local_likes(array['${VISIBLE}']::uuid[]);
  raise exception 'anon migrate was allowed';
exception
  when insufficient_privilege then
    null;
end
$check$;

reset role;
select set_config('app.user_id', '', true);
do $check$
begin
  perform public.migrate_local_likes(array['${VISIBLE}']::uuid[]);
  raise exception 'anonymous owner migrate was allowed';
exception
  when insufficient_privilege then
    null;
end
$check$;

delete from public.posts where id = '${VISIBLE}';
do $check$
declare
  left_rows int;
begin
  select count(*) into left_rows from public.likes where post_id = '${VISIBLE}';
  if left_rows <> 0 then raise exception 'post delete left likes behind'; end if;
end
$check$;

delete from auth.users where id = '${LIKER}';
do $check$
declare
  left_rows int;
begin
  select count(*) into left_rows from public.likes where user_id = '${LIKER}';
  if left_rows <> 0 then raise exception 'user delete left likes behind'; end if;
end
$check$;

rollback;
`;

describe("likes postgres", {
  skip: databaseUrl || ci ? false : "LIKES_TEST_DATABASE_URL is not set",
}, () => {
  it("applies the migration and exercises counts, blocks, visibility, and silent import", () => {
    requireLocalLikesDatabase();
    psql({ sql: fixture });
    psql({ file: migrationPath });
    psql({ file: verifyPath });
    psql({ sql: behavior });
  });
});
