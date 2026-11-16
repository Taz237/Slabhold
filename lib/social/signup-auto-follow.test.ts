import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BRAND_ACCOUNT_IDS } from "@/lib/leaderboard/brand-accounts";
import { OFFICIAL_UPDATES_USER_ID } from "./official-updates";
import { remoteSignIn, remoteSignUp } from "./remote";
import { SIGNUP_AUTO_FOLLOW_USER_ID, followSlabholdOnSignup } from "./signup-auto-follow";

// @slabhold's profile id. @slabholdupdates is OFFICIAL_UPDATES_USER_ID.
const SLABHOLD = "744fedf0-f012-4c9d-841f-18531fdde340";
const UPDATES = "6d31ab97-9162-4296-876d-9e0378872fce";
const signupInput = {
  email: "ada@example.com",
  password: "secret1",
  username: "Wax_Room",
  displayName: "Ada",
};

type FollowRow = { follower_id: string; following_id: string };

function client(options: { userId?: string; followError?: boolean; followThrows?: boolean }) {
  const follows: FollowRow[] = [];
  const tables: string[] = [];
  const supabase = {
    from(table: string) {
      tables.push(table);
      const api = {
        select: () => api,
        ilike: () => api,
        limit: () => Promise.resolve({ data: [], error: null }),
        upsert(row: FollowRow) {
          if (table !== "follows") return Promise.resolve({ error: null });
          if (options.followThrows) throw new Error("follows unavailable");
          if (options.followError) return Promise.resolve({ error: { message: "denied", code: "42501" } });
          const key = `${row.follower_id}:${row.following_id}`;
          if (!follows.some((edge) => `${edge.follower_id}:${edge.following_id}` === key)) {
            follows.push({ follower_id: row.follower_id, following_id: row.following_id });
          }
          return Promise.resolve({ error: null });
        },
        insert: () => Promise.resolve({ error: null }),
      };
      return api;
    },
    auth: {
      async signUp() {
        return {
          data: { session: { access_token: "t" }, user: { id: options.userId ?? "user-1" } },
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
  return { supabase: supabase as unknown as SupabaseClient, follows, tables };
}

describe("signup auto-follows @slabhold", () => {
  it("targets @slabhold's profile id, shared with the brand account list", () => {
    assert.equal(SIGNUP_AUTO_FOLLOW_USER_ID, SLABHOLD);
    assert.equal(SIGNUP_AUTO_FOLLOW_USER_ID, BRAND_ACCOUNT_IDS[0]);
    assert.notEqual(SIGNUP_AUTO_FOLLOW_USER_ID, OFFICIAL_UPDATES_USER_ID);
  });

  it("follows @slabhold, not @slabholdupdates, and writes no notification", async () => {
    const fake = client({});
    assert.deepEqual(await remoteSignUp(fake.supabase, signupInput), {});
    assert.deepEqual(fake.follows, [{ follower_id: "user-1", following_id: SLABHOLD }]);
    assert.equal(fake.follows.some((edge) => edge.following_id === UPDATES), false);
    assert.equal(fake.tables.includes("notifications"), false);
  });

  it("ignores OFFICIAL_UPDATES_USER_ID, so an old env value cannot redirect it", async () => {
    const previous = process.env.OFFICIAL_UPDATES_USER_ID;
    try {
      process.env.OFFICIAL_UPDATES_USER_ID = UPDATES;
      const fake = client({});
      await remoteSignUp(fake.supabase, signupInput);
      assert.deepEqual(fake.follows, [{ follower_id: "user-1", following_id: SLABHOLD }]);
    } finally {
      if (previous === undefined) delete process.env.OFFICIAL_UPDATES_USER_ID;
      else process.env.OFFICIAL_UPDATES_USER_ID = previous;
    }
  });

  it("does not add a second follow when signup is retried", async () => {
    const fake = client({});
    await remoteSignUp(fake.supabase, signupInput);
    await remoteSignUp(fake.supabase, signupInput);
    await followSlabholdOnSignup(fake.supabase, "user-1");
    assert.equal(fake.follows.length, 1);
  });

  it("still creates the account when the follow fails", async () => {
    const failed = client({ followError: true });
    assert.deepEqual(await remoteSignUp(failed.supabase, signupInput), {});
    assert.equal(failed.follows.length, 0);
    const thrown = client({ followThrows: true });
    assert.deepEqual(await remoteSignUp(thrown.supabase, signupInput), {});
    assert.equal(thrown.follows.length, 0);
  });

  it("skips test signups and @slabhold itself", async () => {
    const qa = client({});
    await remoteSignUp(qa.supabase, { ...signupInput, username: "qa_guard_1022" });
    assert.equal(qa.tables.includes("follows"), false);
    const self = client({ userId: SLABHOLD.toUpperCase() });
    await remoteSignUp(self.supabase, signupInput);
    assert.equal(self.tables.includes("follows"), false);
  });

  it("runs only on signup, never on login, profile edits or follow toggles", async () => {
    const fake = client({});
    await remoteSignUp(fake.supabase, signupInput);
    fake.follows.length = 0;
    assert.deepEqual(await remoteSignIn(fake.supabase, "ada@example.com", "secret1"), {});
    assert.equal(fake.follows.length, 0);

    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    assert.equal((remote.match(/followSlabholdOnSignup\(/g) ?? []).length, 1);
    assert.equal(remote.includes("followOfficialUpdates"), false);
    const signUp = remote.slice(
      remote.indexOf("export async function remoteSignUp"),
      remote.indexOf("export async function remoteSignIn"),
    );
    assert.equal(signUp.includes("followSlabholdOnSignup("), true);
  });

  it("matches by profile id in the module, never by handle", () => {
    const source = readFileSync(join(process.cwd(), "lib/social/signup-auto-follow.ts"), "utf8");
    assert.doesNotMatch(source, /slabholdupdates|grokbotreview|ilike|username/);
  });
});

describe("signup auto-follow SQL (unapplied)", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20261116140000_signup_follow_slabhold.sql"),
    "utf8",
  );

  it("is flagged unapplied and moves the profile insert trigger to @slabhold", () => {
    assert.match(migration, /^-- UNAPPLIED\. Needs review before running\./);
    assert.match(migration, new RegExp(SLABHOLD));
    assert.doesNotMatch(migration, new RegExp(`:= '${UPDATES}'`));
    assert.match(migration, /drop trigger if exists profiles_follow_official_updates on public\.profiles;/);
    assert.match(migration, /create trigger profiles_follow_slabhold/);
    assert.match(migration, /after insert on public\.profiles/);
    assert.doesNotMatch(migration, /after insert or update/i);
    assert.match(migration, /new\.is_test is true/);
    assert.equal(migration.includes("lower(new.username) ~ '^(qa_|qa-|test_|vreset_)'"), true);
    assert.match(migration, /on conflict \(follower_id, following_id\) do nothing/);
    assert.match(migration, /set search_path = ''/);
    assert.match(migration, /revoke all on function private\.follow_slabhold_on_signup\(\)/);
    assert.match(migration, /\nbegin;\n/);
    assert.match(migration, /\ncommit;\n?$/);
    assert.doesNotMatch(migration, /delete from|insert into public\.notifications|security definer\s*\n/i);
  });

  it("ships a one-time backfill outside migrations that only adds follows", () => {
    const path = join(process.cwd(), "scripts/backfill-follow-slabhold-from-updates.sql");
    const sql = readFileSync(path, "utf8");
    assert.equal(path.includes(join("supabase", "migrations")), false);
    assert.match(sql, /Not a migration/i);
    assert.match(sql, new RegExp(SLABHOLD));
    assert.match(sql, new RegExp(UPDATES));
    assert.match(sql, /where follows\.following_id = params\.updates_id/);
    assert.match(sql, /follows\.follower_id <> params\.slabhold_id/);
    assert.match(sql, /on conflict \(follower_id, following_id\) do nothing/);
    assert.match(sql, /from public\.blocks/);
    assert.doesNotMatch(sql, /delete from|update public\.|insert into public\.notifications/i);
  });
});
