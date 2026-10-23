import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const setupSql = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;

create table public.profiles (
  id uuid primary key,
  username text not null,
  display_name text not null default 'n',
  bio text not null default '',
  accent text not null default '#7c5cff',
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create or replace function public.reserve_username_stub()
returns trigger
language plpgsql
as $$ begin return new; end $$;

create trigger profiles_reserve_username
  before insert or update of username on public.profiles
  for each row
  execute function public.reserve_username_stub();
`;

const behaviorSql = `
do $$
declare
  uid uuid := '11111111-1111-1111-1111-111111111111';
  visible uuid := '22222222-2222-2222-2222-222222222222';
  hidden uuid := '33333333-3333-3333-3333-333333333333';
begin
  perform set_config('app.user_id', uid::text, false);
  insert into public.profiles (id, username) values (uid, 'wax');
  insert into public.posts (id, user_id, content)
    values (visible, uid, 'show');
  insert into public.posts (id, user_id, content, hidden_at)
    values (hidden, uid, 'hide', now());

  begin
    perform public.pin_post(hidden);
    raise exception 'hidden pin was allowed';
  exception
    when insufficient_privilege then
      if sqlstate <> '42501' or sqlerrm not like '%can only pin your own post%' then
        raise exception 'pin_post hid the wrong error: % %', sqlstate, sqlerrm;
      end if;
  end;

  begin
    update public.profiles set pinned_post_id = hidden where id = uid;
    raise exception 'direct hidden pin was allowed';
  exception
    when insufficient_privilege then
      if sqlstate <> '42501' or sqlerrm not like '%can only pin your own post%' then
        raise exception 'trigger hid the wrong error: % %', sqlstate, sqlerrm;
      end if;
  end;

  perform public.pin_post(visible);
  if (select pinned_post_id from public.profiles where id = uid) is distinct from visible then
    raise exception 'a visible post was not pinned';
  end if;

  update public.posts set hidden_at = now() where id = visible;
  if (select pinned_post_id from public.profiles where id = uid) is not null then
    raise exception 'hiding a pinned post left the pin in place';
  end if;
end
$$;
`;

function postgresBin(name: string) {
  const root = "/usr/lib/postgresql";
  if (existsSync(root)) {
    for (const version of readdirSync(root).sort().reverse()) {
      const path = join(root, version, "bin", name);
      if (existsSync(path)) return path;
    }
  }
  return name;
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not reserve a port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function run(bin: string, args: string[]) {
  return spawnSync(bin, args, { encoding: "utf8" });
}

function must(bin: string, args: string[], label: string) {
  const result = run(bin, args);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

describe("profile pin hidden posts", () => {
  const cluster = { root: "", dataDir: "", pgCtl: "" };

  after(() => {
    if (cluster.pgCtl && cluster.dataDir) {
      run(cluster.pgCtl, ["-D", cluster.dataDir, "-m", "immediate", "-w", "stop"]);
    }
    if (cluster.root) rmSync(cluster.root, { recursive: true, force: true });
  });

  it("refuses a hidden pin and clears a pin when the post is hidden", { timeout: 120_000 }, async () => {
    const initdb = postgresBin("initdb");
    const pgCtl = postgresBin("pg_ctl");
    const psql = postgresBin("psql");
    cluster.pgCtl = pgCtl;
    cluster.root = mkdtempSync(join(tmpdir(), "pgpin-"));
    cluster.dataDir = join(cluster.root, "data");
    const port = await freePort();

    must(initdb, ["-D", cluster.dataDir, "--auth=trust", "--no-sync", "--username", userInfo().username], "initdb");
    must(
      pgCtl,
      [
        "-D",
        cluster.dataDir,
        "-l",
        join(cluster.root, "server.log"),
        "-w",
        "start",
        "-o",
        `-p ${port} -k ${cluster.root} -c listen_addresses=`,
      ],
      "pg_ctl start",
    );

    const psqlArgs = [
      "-h",
      cluster.root,
      "-p",
      String(port),
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
    ];
    writeFileSync(join(cluster.root, "setup.sql"), setupSql);
    writeFileSync(join(cluster.root, "behavior.sql"), behaviorSql);
    must(psql, [...psqlArgs, join(cluster.root, "setup.sql")], "setup");
    must(
      psql,
      [...psqlArgs, join(process.cwd(), "supabase/migrations/20261023003000_profile_pinned_post.sql")],
      "migration",
    );
    must(psql, [...psqlArgs, join(cluster.root, "behavior.sql")], "pin behavior");

    const verify = must(
      psql,
      [...psqlArgs, join(process.cwd(), "scripts/verify-profile-pin.sql")],
      "verify",
    );
    const notes = `${verify.stdout}\n${verify.stderr}`;
    assert.doesNotMatch(notes, /FAIL:/);
    assert.match(notes, /pin checks require a visible post the profile owns/);
    assert.match(notes, /posts_clear_pin_when_hidden is enabled/);
    assert.match(notes, /search_path=""/);
    assert.match(notes, /cannot execute the pin trigger functions/);
  });
});
