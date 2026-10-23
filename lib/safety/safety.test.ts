import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { remoteAddComment } from "../social/remote";
import { adminAccess, isAdmin } from "./admin";
import { BLOCKED_INTERACTION, blockUser } from "./block";
import { canNotify, supabaseSafety } from "./can-notify";
import { applyAuthorSafety, withAuthorSafety, type SafetyQuery } from "./filters";
import { saveReport, validateReport } from "./report";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const MUTED = "33333333-3333-4333-8333-333333333333";

function relations(flags: { blocked?: boolean; muted?: boolean }) {
  return {
    async isBlocked() {
      return flags.blocked === true;
    },
    async isMuted() {
      return flags.muted === true;
    },
  };
}

describe("supabaseSafety isBlocked", () => {
  it("does not treat the same account as blocked and skips the rpc", async () => {
    let calls = 0;
    const fake = {
      async rpc() {
        calls += 1;
        return { data: false, error: null };
      },
    };
    assert.equal(await supabaseSafety(fake).isBlocked("u1", "u1"), false);
    assert.equal(await supabaseSafety(fake).isBlocked("u1", ""), false);
    assert.equal(calls, 0);
  });

  it("still treats a different account as blocked when can_interact is false", async () => {
    let calls = 0;
    const fake = {
      async rpc(_fn: string, args?: Record<string, unknown>) {
        calls += 1;
        assert.equal(args?.other, "u2");
        return { data: false, error: null };
      },
    };
    assert.equal(await supabaseSafety(fake).isBlocked("u1", "u2"), true);
    assert.equal(calls, 1);
  });
});

function commentClient(rpcData: boolean) {
  let rpcCalls = 0;
  let inserted: { post_id: string; user_id: string; body: string } | null = null;
  const supabase = {
    async rpc() {
      rpcCalls += 1;
      return { data: rpcData, error: null };
    },
    from(table: string) {
      return {
        insert(row: { post_id: string; user_id: string; body: string }) {
          if (table === "comments") inserted = row;
          const payload = { data: { id: "comment-id" }, error: null };
          const result = {
            select() {
              return result;
            },
            maybeSingle() {
              return Promise.resolve(payload);
            },
            then(
              onFulfilled: (value: { data: { id: string } | null; error: null }) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              return Promise.resolve(payload).then(onFulfilled, onRejected);
            },
          };
          return result;
        },
      };
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    rpcCalls: () => rpcCalls,
    inserted: () => inserted,
  };
}

describe("remoteAddComment block check", () => {
  it("inserts a reply on your own post when can_interact would say blocked", async () => {
    const fake = commentClient(false);
    const result = await remoteAddComment(fake.supabase, "u1", "post-1", "  nice card  ", "u1");
    assert.equal(result.error, undefined);
    assert.equal(fake.rpcCalls(), 0);
    assert.deepEqual(fake.inserted(), {
      post_id: "post-1",
      user_id: "u1",
      body: "nice card",
    });
  });

  it("returns BLOCKED_INTERACTION when a different user is blocked", async () => {
    const fake = commentClient(false);
    const result = await remoteAddComment(fake.supabase, "u1", "post-1", "nice card", "u2");
    assert.equal(result.error, BLOCKED_INTERACTION);
    assert.equal(fake.inserted(), null);
  });
});

describe("canNotify", () => {
  it("returns false when either person blocked the other", async () => {
    assert.equal(await canNotify(relations({ blocked: true }), "actor", "recipient"), false);
  });

  it("returns true for a normal pair", async () => {
    assert.equal(await canNotify(relations({}), "actor", "recipient"), true);
  });

  it("returns false when the recipient muted the actor", async () => {
    assert.equal(await canNotify(relations({ muted: true }), "actor", "recipient"), false);
  });
});

describe("safety filter", () => {
  it("builds a query excluding blocked and muted authors for the viewer only", async () => {
    const calls: string[] = [];
    let rpcCount = 0;
    const query: SafetyQuery = {
      not(column, op, value) {
        calls.push(`${column} ${op} ${value}`);
        return query;
      },
      or(filters) {
        calls.push(filters);
        return query;
      },
    };
    const supabase = {
      async rpc(_fn: string, args?: Record<string, unknown>) {
        rpcCount += 1;
        assert.equal(args?.apply_mute, true);
        return { data: [AUTHOR, MUTED], error: null };
      },
    };
    const filtered = await withAuthorSafety(supabase, query, VIEWER, {
      mute: true,
    });
    assert.equal(filtered.query, query);
    assert.equal(rpcCount, 1);
    assert.deepEqual(calls, [`user_id in (${AUTHOR},${MUTED})`]);

    const skipped = await withAuthorSafety(supabase, query, null, { mute: true });
    assert.equal(skipped.query, query);
    assert.equal(rpcCount, 1);

    const nullAuthors: string[] = [];
    applyAuthorSafety(
      {
        not() {
          throw new Error("null actors should use or()");
        },
        or(filters) {
          nullAuthors.push(filters);
          return query;
        },
      },
      VIEWER,
      [AUTHOR],
      { authorColumn: "actor_id", keepNullAuthor: true },
    );
    assert.equal(nullAuthors[0], `actor_id.is.null,actor_id.not.in.(${AUTHOR})`);
  });
});

describe("report", () => {
  it("rejects an unknown reason or details over 500 characters", () => {
    assert.equal(validateReport({ reason: "nope" }), "Pick a reason.");
    assert.match(validateReport({ reason: "spam", details: "x".repeat(501) }) ?? "", /500/);
    assert.equal(validateReport({ reason: "spam", details: "ok" }), null);
  });

  it("returns success for a duplicate report without an error", async () => {
    let inserts = 0;
    const result = await saveReport(
      {
        async insert() {
          inserts += 1;
          return { code: "23505", error: "duplicate" };
        },
      },
      {
        reporterId: VIEWER,
        targetType: "post",
        targetId: AUTHOR,
        reportedUserId: AUTHOR,
        reason: "spam",
        details: "again",
      },
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(inserts, 1);
  });
});

describe("block", () => {
  it("deletes follows both ways and rejects blocking yourself", async () => {
    const follows: string[] = [];
    const self = await blockUser(
      {
        async insertBlock() {
          return {};
        },
        async deleteFollow() {
          return {};
        },
      },
      VIEWER,
      VIEWER,
    );
    assert.equal(self.ok, false);

    const result = await blockUser(
      {
        async insertBlock(blockerId, blockedId) {
          assert.equal(blockerId, VIEWER);
          assert.equal(blockedId, AUTHOR);
          return {};
        },
        async deleteFollow(followerId, followingId) {
          follows.push(`${followerId}->${followingId}`);
          return {};
        },
      },
      VIEWER,
      AUTHOR,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(follows, [`${VIEWER}->${AUTHOR}`, `${AUTHOR}->${VIEWER}`]);
  });
});

describe("admin", () => {
  it("parses ADMIN_USER_IDS with spaces, empty, and missing values", () => {
    assert.equal(isAdmin(VIEWER, ` ${VIEWER} , , ${AUTHOR} `), true);
    assert.equal(isAdmin(MUTED, ` ${VIEWER} , , ${AUTHOR} `), false);
    assert.equal(isAdmin(VIEWER, ""), false);
    assert.equal(isAdmin(VIEWER, null), false);
    assert.equal(isAdmin(null, VIEWER), false);
  });

  it("sends a non-admin to notFound", () => {
    assert.equal(adminAccess(AUTHOR, VIEWER), "notFound");
    assert.equal(adminAccess(VIEWER, VIEWER), "allow");
  });
});

describe("safety migration", () => {
  it("enables RLS on blocks, mutes, and reports", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261017240000_safety_blocks_mutes_reports.sql"),
      "utf8",
    );
    for (const table of ["blocks", "mutes", "reports"]) {
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
    assert.doesNotMatch(sql, /drop column/i);
  });

  it("moves pair checks out of the public API", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261017250000_private_safety_functions.sql"),
      "utf8",
    );
    assert.match(sql, /create schema if not exists private/i);
    assert.match(sql, /grant usage on schema private to anon, authenticated/i);
    assert.match(sql, /function private\.is_blocked/i);
    assert.match(sql, /function private\.is_muted/i);
    assert.match(sql, /function private\.post_author/i);
    assert.match(sql, /function public\.can_interact/i);
    assert.match(sql, /drop function if exists public\.is_blocked/i);
    assert.match(sql, /drop function if exists public\.is_muted/i);
    assert.match(sql, /drop function if exists public\.post_author/i);
    assert.doesNotMatch(sql, /blocked_id\s*=\s*auth\.uid\(\)/i);
    assert.match(sql, /not private\.is_muted\(auth\.uid\(\), actor_id\)/i);
    assert.match(sql, /Create notifications as yourself[\s\S]*private\.is_blocked/i);
    assert.match(sql, /Repost as yourself[\s\S]*private\.is_blocked/i);
  });

  it("creates quote notifications even when the recipient muted the actor", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261017260000_notification_mute_on_read.sql"),
      "utf8",
    );
    const fn = sql.slice(
      sql.search(/function public\.notify_quote_on_post/i),
      sql.search(/drop policy if exists "Read related notifications"/i),
    );
    assert.match(fn, /if private\.is_blocked\(new\.user_id, original_author\) then/i);
    assert.doesNotMatch(fn, /is_muted/i);
    assert.match(sql, /auth\.uid\(\) = recipient_id/i);
    assert.match(sql, /not private\.is_muted\(auth\.uid\(\), actor_id\)/i);
    assert.match(sql, /auth\.uid\(\) = actor_id[\s\S]*kind <> 'want_alert'/i);
  });
});

describe("notification inserts ignore mutes", () => {
  it("skips a want alert when the recipient muted the actor, and still inserts other notices", () => {
    const canNotifySource = readFileSync(join(process.cwd(), "lib/safety/can-notify.ts"), "utf8");
    const wantDb = readFileSync(join(process.cwd(), "lib/wants/want-db.ts"), "utf8");
    assert.match(canNotifySource, /isMuted/);
    assert.match(wantDb, /isMuted/);
    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    assert.doesNotMatch(remote, /is_muted|isMuted/);
  });

  it("maps a quote insert blocked by row-level security to a plain message", () => {
    const source = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    const fn = source.slice(source.indexOf("export async function remoteCreatePost"));
    assert.match(fn, /quoted_post_id: quotedPostId/);
    assert.match(fn, /rlsBlocked\(error\) \? BLOCKED_INTERACTION/);
  });
});

describe("support email", () => {
  it("shows the support address as a mailto link on terms", () => {
    const support = readFileSync(join(process.cwd(), "lib/support.ts"), "utf8");
    const terms = readFileSync(join(process.cwd(), "app/terms/page.tsx"), "utf8");
    assert.match(support, /slabholdapp@gmail\.com/);
    assert.doesNotMatch(support, /TODO/);
    assert.match(terms, /Contact support:/);
    assert.match(terms, /mailto:\$\{SUPPORT_EMAIL\}/);
  });
});
