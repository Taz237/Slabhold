import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import nextConfig from "../../next.config";
import { remoteSignIn, remoteSignUp } from "./remote";
import {
  OFFICIAL_UPDATES_USER_ID,
  followOfficialUpdates,
  officialUpdatesFollow,
  officialUpdatesUserId,
} from "./official-updates";

const UPDATES = "6d31ab97-9162-4296-876d-9e0378872fce";
const signupInput = {
  email: "ada@example.com",
  password: "secret1",
  username: "Wax_Room",
  displayName: "Ada",
};

type FollowRow = { follower_id: string; following_id: string };

function client(options: {
  userId?: string;
  session?: object | null;
  followError?: { message: string; code?: string } | null;
  followThrows?: boolean;
}) {
  const follows: FollowRow[] = [];
  const tables: string[] = [];
  const notifications: unknown[] = [];
  const supabase = {
    from(table: string) {
      tables.push(table);
      const api = {
        select() {
          return api;
        },
        ilike() {
          return api;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        upsert(row: FollowRow) {
          if (table !== "follows") return Promise.resolve({ error: null });
          if (options.followThrows) throw new Error("follows unavailable");
          if (options.followError) return Promise.resolve({ error: options.followError });
          const key = `${row.follower_id}:${row.following_id}`;
          if (!follows.some((edge) => `${edge.follower_id}:${edge.following_id}` === key)) {
            follows.push({ follower_id: row.follower_id, following_id: row.following_id });
          }
          return Promise.resolve({ error: null });
        },
        insert(row: unknown) {
          if (table === "notifications") notifications.push(row);
          return Promise.resolve({ error: null });
        },
      };
      return api;
    },
    auth: {
      async signUp() {
        return {
          data: {
            session: options.session === undefined ? { access_token: "t" } : options.session,
            user: { id: options.userId ?? "user-1" },
          },
          error: null,
        };
      },
      async getSession() {
        return { data: { session: null } };
      },
      async signInWithPassword() {
        return { error: null };
      },
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    follows,
    tables,
    notifications,
  };
}

function withoutOfficialEnv(run: () => Promise<void>): Promise<void> {
  const previous = process.env.OFFICIAL_UPDATES_USER_ID;
  delete process.env.OFFICIAL_UPDATES_USER_ID;
  return run().finally(() => {
    if (previous === undefined) delete process.env.OFFICIAL_UPDATES_USER_ID;
    else process.env.OFFICIAL_UPDATES_USER_ID = previous;
  });
}

describe("officialUpdatesUserId", () => {
  it("defaults to the updates account uuid and no-ops when the value is missing or not a uuid", () => {
    assert.equal(OFFICIAL_UPDATES_USER_ID, UPDATES);
    assert.equal(officialUpdatesUserId(undefined), UPDATES);
    assert.equal(officialUpdatesUserId(null), UPDATES);
    assert.equal(officialUpdatesUserId(""), null);
    assert.equal(officialUpdatesUserId("  "), null);
    assert.equal(officialUpdatesUserId("slabholdupdates"), null);
    assert.equal(officialUpdatesUserId("grokbotreview"), null);
    assert.equal(
      officialUpdatesUserId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("skips a self-follow", () => {
    assert.equal(officialUpdatesFollow(UPDATES, UPDATES), null);
    assert.equal(officialUpdatesFollow(UPDATES.toUpperCase(), UPDATES), null);
    assert.deepEqual(officialUpdatesFollow("user-1", UPDATES), {
      follower_id: "user-1",
      following_id: UPDATES,
    });
    assert.equal(officialUpdatesFollow("user-1", null), null);
  });
});

describe("signup auto-follow", () => {
  it("follows the updates account once and does not notify it", async () => {
    await withoutOfficialEnv(async () => {
      const fake = client({});
      assert.deepEqual(await remoteSignUp(fake.supabase, signupInput), {});
      assert.deepEqual(fake.follows, [{ follower_id: "user-1", following_id: UPDATES }]);
      assert.equal(fake.notifications.length, 0);
      assert.equal(fake.tables.includes("notifications"), false);
    });
  });

  it("does not insert a second follow when signup is retried", async () => {
    await withoutOfficialEnv(async () => {
      const fake = client({});
      await remoteSignUp(fake.supabase, signupInput);
      await remoteSignUp(fake.supabase, signupInput);
      await followOfficialUpdates(fake.supabase, "user-1");
      assert.equal(fake.follows.length, 1);
    });
  });

  it("still creates the account when the follow insert fails", async () => {
    await withoutOfficialEnv(async () => {
      const failed = client({ followError: { message: "permission denied", code: "42501" } });
      assert.deepEqual(await remoteSignUp(failed.supabase, signupInput), {});
      assert.equal(failed.follows.length, 0);

      const thrown = client({ followThrows: true });
      assert.deepEqual(await remoteSignUp(thrown.supabase, signupInput), {});
      assert.equal(thrown.follows.length, 0);
    });
  });

  it("does not auto-follow a test signup such as qa_guard_1022", async () => {
    await withoutOfficialEnv(async () => {
      const fake = client({});
      assert.deepEqual(
        await remoteSignUp(fake.supabase, { ...signupInput, username: "qa_guard_1022" }),
        {},
      );
      assert.equal(fake.follows.length, 0);
      assert.equal(fake.tables.includes("follows"), false);
    });
  });

  it("does not follow itself", async () => {
    await withoutOfficialEnv(async () => {
      const fake = client({ userId: UPDATES });
      assert.deepEqual(await remoteSignUp(fake.supabase, signupInput), {});
      assert.equal(fake.follows.length, 0);
      assert.equal(fake.tables.includes("follows"), false);
    });
  });

  it("does not refollow after an unfollow", async () => {
    await withoutOfficialEnv(async () => {
      const fake = client({});
      await remoteSignUp(fake.supabase, signupInput);
      assert.equal(fake.follows.length, 1);
      fake.follows.length = 0;

      assert.deepEqual(await remoteSignIn(fake.supabase, "ada@example.com", "secret1"), {});
      assert.equal(fake.follows.length, 0);

      const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
      const signIn = remote.slice(
        remote.indexOf("export async function remoteSignIn"),
        remote.indexOf("export async function remoteSignOut"),
      );
      const update = remote.slice(
        remote.indexOf("export async function remoteUpdateProfile"),
        remote.indexOf("export async function remoteToggleFollow"),
      );
      const toggle = remote.slice(
        remote.indexOf("export async function remoteToggleFollow"),
        remote.indexOf("export async function remoteFollowAll"),
      );
      assert.equal(signIn.includes("followOfficialUpdates"), false);
      assert.equal(update.includes("followOfficialUpdates"), false);
      assert.equal(toggle.includes("followOfficialUpdates"), false);
      assert.equal((remote.match(/followOfficialUpdates\(/g) ?? []).length, 1);

      const confirm = readFileSync(join(process.cwd(), "lib/auth/confirm-request.ts"), "utf8");
      assert.equal(confirm.includes("followOfficialUpdates"), false);
    });
  });

  it("no-ops when the id is unset or not a uuid, and does not read a handle", async () => {
    const previous = process.env.OFFICIAL_UPDATES_USER_ID;
    try {
      process.env.OFFICIAL_UPDATES_USER_ID = "";
      const blank = client({});
      assert.deepEqual(await remoteSignUp(blank.supabase, signupInput), {});
      assert.equal(blank.follows.length, 0);

      process.env.OFFICIAL_UPDATES_USER_ID = "slabholdupdates";
      const handle = client({});
      assert.deepEqual(await remoteSignUp(handle.supabase, signupInput), {});
      assert.equal(handle.follows.length, 0);
    } finally {
      if (previous === undefined) delete process.env.OFFICIAL_UPDATES_USER_ID;
      else process.env.OFFICIAL_UPDATES_USER_ID = previous;
    }

    const source = readFileSync(join(process.cwd(), "lib/social/official-updates.ts"), "utf8");
    assert.equal(source.includes("grokbotreview"), false);
    assert.equal(source.includes("slabholdupdates"), false);
    assert.match(source, new RegExp(UPDATES));
    assert.match(source, /env uuid and the SQL uuid in private\.follow_official_updates must stay in sync/);
  });

  it("leaves confirm-email signup to the profile insert trigger", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20261022210000_follow_official_updates.sql"),
      "utf8",
    );
    assert.match(migration, new RegExp(UPDATES));
    assert.match(migration, /after insert on public\.profiles/);
    assert.match(migration, /on conflict \(follower_id, following_id\) do nothing/);
    assert.match(migration, /\nbegin;\n/);
    assert.match(migration, /set local lock_timeout = '5s';/);
    assert.match(migration, /\ncommit;\n?$/);
    assert.match(migration, /set search_path = ''/);
    assert.doesNotMatch(migration, /set search_path = public/);
    assert.match(migration, /insert into public\.follows/);
    assert.match(migration, /from public\.profiles/);
    assert.match(
      migration,
      /raise warning 'follow_official_updates: auto-follow skipped for profile %: % \(%\)', new\.id, sqlerrm, sqlstate;/,
    );
    assert.doesNotMatch(migration, /when others then\s+null;/);
    assert.match(migration, /env uuid \(OFFICIAL_UPDATES_USER_ID\) and this SQL uuid must stay in sync/);
    assert.match(migration, /exception/);
    assert.match(migration, /when others then/);
    assert.match(migration, /if new\.id = updates_id then/);
    assert.match(migration, /where exists/);
    assert.match(migration, /missing updates profile is skipped silently/);
    assert.match(migration, /with no warning/);
    assert.doesNotMatch(migration, /notifications/);
    assert.doesNotMatch(migration, /grokbotreview|slabholdupdates/);
    assert.match(migration, /revoke all on function private\.follow_official_updates\(\)/);
  });
});

describe("updates account redirect", () => {
  it("permanently sends /u/grokbotreview to /u/slabholdupdates", async () => {
    assert.ok(nextConfig.redirects);
    const redirects = await nextConfig.redirects();
    const exact = redirects.find((item) => item.source === "/u/grokbotreview");
    const nested = redirects.find((item) => item.source === "/u/grokbotreview/:path*");
    assert.ok(exact);
    assert.equal(exact.destination, "/u/slabholdupdates");
    assert.equal(exact.permanent, true);
    assert.ok(nested);
    assert.equal(nested.destination, "/u/slabholdupdates/:path*");
    assert.equal(nested.permanent, true);
  });
});

describe("backfill script", () => {
  it("is a one-time script with the uuid parameter, not a migration", () => {
    const path = join(process.cwd(), "scripts/backfill-follow-updates.sql");
    const sql = readFileSync(path, "utf8");
    assert.equal(path.endsWith("scripts/backfill-follow-updates.sql"), true);
    assert.equal(path.includes(`${join("supabase", "migrations")}`), false);
    assert.match(sql, /Not a migration/i);
    assert.match(sql, /PARAMETER: official_updates_user_id/);
    assert.match(sql, new RegExp(UPDATES));
    assert.match(sql, /profiles\.id <> params\.official_updates_user_id/);
    assert.match(sql, /on conflict \(follower_id, following_id\) do nothing/);
    assert.match(sql, /re-follows prior unfollowers/);
    assert.match(sql, /and not profiles\.is_test/);
    assert.match(sql, /lower\(profiles\.username\) <> 'qa_vreset_1021'/);
    assert.match(sql, /left\(lower\(profiles\.username\), 3\) <> 'qa_'/);
    assert.match(sql, /left\(lower\(profiles\.username\), 3\) <> 'qa-'/);
    assert.match(sql, /left\(lower\(profiles\.username\), 5\) <> 'test_'/);
    assert.match(sql, /left\(lower\(profiles\.username\), 7\) <> 'vreset_'/);
    assert.match(sql, /and exists \(/);
    assert.match(sql, /from public\.blocks/);
    assert.match(
      sql,
      /blocks\.blocker_id = profiles\.id and blocks\.blocked_id = params\.official_updates_user_id/,
    );
    assert.match(
      sql,
      /blocks\.blocker_id = params\.official_updates_user_id and blocks\.blocked_id = profiles\.id/,
    );
    assert.match(sql, /env uuid \(OFFICIAL_UPDATES_USER_ID\) and this SQL uuid must stay in sync/);
    assert.match(sql, /\+ \(select count\(\*\) from inserted\) as follows_to_updates/);
    assert.doesNotMatch(sql, /insert into public\.notifications/);
    assert.doesNotMatch(sql, /grokbotreview|slabholdupdates/);
    assert.match(sql, /as inserted_follows/);
    assert.match(sql, /as profiles/);
    assert.match(sql, /as follows_to_updates/);
    assert.match(sql, /as updates_account_present/);
  });
});

describe("test signup auto-follow skip", () => {
  const applied = join(process.cwd(), "supabase/migrations/20261022210000_follow_official_updates.sql");
  const migrationPath = join(process.cwd(), "supabase/migrations/20261022240000_skip_test_autofollow.sql");
  const skip = "lower(new.username) ~ '^(qa_|qa-|test_|vreset_)'";

  it("replaces the trigger in a new migration and leaves the applied file alone", () => {
    const previous = readFileSync(applied, "utf8");
    const migration = readFileSync(migrationPath, "utf8");
    assert.equal(previous.includes(skip), false);
    assert.equal(previous.includes("new.is_test is true"), false);
    assert.match(migration, new RegExp(UPDATES));
    assert.equal(migration.includes("new.is_test is true"), true);
    assert.equal(migration.includes(skip), true);
    assert.match(migration, /for example qa_guard_1022/);
    assert.match(migration, /after insert on public\.profiles/);
    assert.doesNotMatch(migration, /after insert or update/i);
    assert.match(migration, /on conflict \(follower_id, following_id\) do nothing/);
    assert.match(migration, /\nbegin;\n/);
    assert.match(migration, /set local lock_timeout = '5s';/);
    assert.match(migration, /\ncommit;\n?$/);
    assert.match(migration, /set search_path = ''/);
    assert.doesNotMatch(migration, /set search_path = public/);
    assert.match(migration, /The function is not security definer/);
    assert.doesNotMatch(migration, /create or replace function[\s\S]*security definer/i);
    assert.match(migration, /insert into public\.follows/);
    assert.match(migration, /from public\.profiles/);
    assert.match(
      migration,
      /raise warning 'follow_official_updates: auto-follow skipped for profile %: % \(%\)', new\.id, sqlerrm, sqlstate;/,
    );
    assert.match(migration, /if new\.id = updates_id then/);
    assert.match(migration, /where exists/);
    assert.match(migration, /missing updates profile is skipped silently/);
    assert.match(migration, /with no warning/);
    assert.match(migration, /unfollow is never reversed/);
    assert.match(migration, /20261022210000_follow_official_updates\.sql/);
    assert.match(migration, /env uuid \(OFFICIAL_UPDATES_USER_ID\) and this SQL uuid must stay in sync/);
    assert.doesNotMatch(migration, /insert into public\.notifications/);
    assert.doesNotMatch(migration, /grokbotreview|slabholdupdates/);
    assert.doesNotMatch(migration, /delete from/i);
    assert.doesNotMatch(migration, /update public\./i);
    assert.match(migration, /revoke all on function private\.follow_official_updates\(\)/);

    const pattern = /^(qa_|qa-|test_|vreset_)/;
    assert.equal(pattern.test("qa_guard_1022"), true);
    assert.equal(pattern.test("qa-bot"), true);
    assert.equal(pattern.test("test_user"), true);
    assert.equal(pattern.test("vreset_1021"), true);
    assert.equal(pattern.test("slabhold"), false);
    assert.equal(pattern.test("slabholdupdates"), false);
    assert.equal(pattern.test("grokbotreview"), false);
    assert.equal(pattern.test("qualitycards"), false);
  });

  it("ships a read-only verify script outside migrations", () => {
    const path = join(process.cwd(), "scripts/verify-autofollow-skip-test.sql");
    const sql = readFileSync(path, "utf8");
    assert.equal(path.includes(`${join("supabase", "migrations")}`), false);
    assert.match(sql, /Not a migration/i);
    assert.match(sql, /set local transaction_read_only = on;/);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /\nbegin;\n/);
    assert.match(sql, /\nrollback;\n?$/);
    assert.doesNotMatch(sql, /\ncommit;/i);
    assert.match(sql, /new\.is_test is true/);
    assert.equal(
      sql.includes("position('lower(new.username) ~ ''^(qa_|qa-|test_|vreset_)''' in fn_src)"),
      true,
    );
    assert.match(sql, /p\.is_test is true/);
    assert.equal(sql.includes("lower(p.username) ~ '^(qa_|qa-|test_|vreset_)'"), true);
    assert.match(sql, new RegExp(UPDATES));
    assert.match(sql, /not t\.tgisinternal/);
    assert.match(sql, /after insert/i);
    assert.match(sql, /left unchanged/);
    assert.match(sql, /env uuid \(OFFICIAL_UPDATES_USER_ID\) and this SQL uuid must stay in sync/);
    assert.doesNotMatch(sql, /insert into/i);
    assert.doesNotMatch(sql, /delete from/i);
    assert.doesNotMatch(sql, /update public\./i);
    assert.doesNotMatch(sql, /grokbotreview|slabholdupdates/);
  });
});
