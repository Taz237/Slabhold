import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUSPEND_AUTHOR_MISMATCH,
  SUSPEND_BAN_DURATION,
  SUSPEND_TARGET_GONE,
  suspendReportedUser,
} from "./moderation";

const MOD = "mod-1";
const OTHER_ADMIN = "mod-2";
const REPORTED = "user-bad";

type Write = { table: string; row: Record<string, unknown>; filters: string[] };
type Report = { target_type: string; target_id: string; reported_user_id: string };

/** Fake service-role client over in-memory rows. Never talks to Supabase. */
function fakeAdmin(
  report: Report | null = { target_type: "post", target_id: "post-1", reported_user_id: REPORTED },
  authors: { posts?: Record<string, string>; comments?: Record<string, string> } = {
    posts: { "post-1": REPORTED },
  },
) {
  const writes: Write[] = [];
  const bans: { id: string; attrs: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const client = {
    auth: {
      admin: {
        async updateUserById(id: string, attrs: Record<string, unknown>) {
          bans.push({ id, attrs });
          return { data: { user: { id } }, error: null };
        },
      },
    },
    from(table: string) {
      const filters: string[] = [];
      const ids: string[] = [];
      const query = {
        select(columns: string) {
          reads.push(`${table}:${columns}`);
          return query;
        },
        update(row: Record<string, unknown>) {
          writes.push({ table, row, filters });
          return query;
        },
        eq(column: string, value: string) {
          filters.push(`${column}=${value}`);
          if (column === "id") ids.push(value);
          return query;
        },
        is(column: string, value: null) {
          filters.push(`${column} is ${value}`);
          return query;
        },
        async maybeSingle() {
          if (table === "reports") return { data: report, error: null };
          const map = table === "posts" ? authors.posts : table === "comments" ? authors.comments : undefined;
          const userId = map?.[ids[0] ?? ""];
          return { data: userId ? { user_id: userId } : null, error: null };
        },
        then(resolve: (value: { error: null }) => unknown) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, writes, bans, reads };
}

function deps(admin: SupabaseClient, userId: string | null = MOD) {
  return {
    getUserId: async () => userId,
    createAdmin: () => admin,
    adminIds: `${MOD},${OTHER_ADMIN}`,
  };
}

describe("suspendReportedUser", () => {
  it("is not found for non-admins and signed-out visitors", async () => {
    for (const userId of ["user-2", null]) {
      const { client, writes, bans } = fakeAdmin();
      await assert.rejects(suspendReportedUser("report-1", deps(client, userId)), (error: Error) =>
        /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String((error as { digest?: string }).digest ?? error.message)),
      );
      assert.equal(bans.length, 0);
      assert.equal(writes.length, 0);
    }
  });

  it("refuses the moderator's own account and any admin account", async () => {
    for (const id of [MOD, OTHER_ADMIN]) {
      const { client, writes, bans } = fakeAdmin(
        { target_type: "post", target_id: "post-1", reported_user_id: id },
        { posts: { "post-1": id } },
      );
      const result = await suspendReportedUser("report-1", deps(client));
      assert.equal(result.error, "You can't suspend a moderator account.");
      assert.equal(bans.length, 0);
      assert.equal(writes.length, 0);
    }
  });

  it("refuses a report whose reported_user_id isn't the post's author, changing nothing", async () => {
    // A reporter's client set reported_user_id to someone else.
    const { client, writes, bans } = fakeAdmin(
      { target_type: "post", target_id: "post-1", reported_user_id: "user-innocent" },
      { posts: { "post-1": REPORTED } },
    );
    const result = await suspendReportedUser("report-1", deps(client));
    assert.equal(result.error, SUSPEND_AUTHOR_MISMATCH);
    assert.equal(result.error, "This report names a different account than the author");
    assert.equal(bans.length, 0);
    assert.equal(writes.length, 0);
  });

  it("refuses when the reported post or reply is gone", async () => {
    for (const target_type of ["post", "reply"]) {
      const { client, writes, bans } = fakeAdmin(
        { target_type, target_id: "gone-1", reported_user_id: REPORTED },
        { posts: {}, comments: {} },
      );
      const result = await suspendReportedUser("report-1", deps(client));
      assert.equal(result.error, SUSPEND_TARGET_GONE);
      assert.equal(result.error, "This post is gone. Suspend from a report on the account");
      assert.equal(bans.length, 0);
      assert.equal(writes.length, 0);
    }
  });

  it("finds a reply's author in comments", async () => {
    const { client, bans, reads } = fakeAdmin(
      { target_type: "reply", target_id: "reply-1", reported_user_id: REPORTED },
      { comments: { "reply-1": REPORTED } },
    );
    assert.deepEqual(await suspendReportedUser("report-1", deps(client)), {});
    assert.ok(reads.includes("comments:user_id"));
    assert.deepEqual(bans.map((ban) => ban.id), [REPORTED]);
  });

  it("uses the target of a user report", async () => {
    const { client, bans, reads } = fakeAdmin(
      { target_type: "user", target_id: REPORTED, reported_user_id: REPORTED },
      {},
    );
    assert.deepEqual(await suspendReportedUser("report-1", deps(client)), {});
    assert.ok(!reads.some((read) => read.startsWith("posts:") || read.startsWith("comments:")));
    assert.deepEqual(bans.map((ban) => ban.id), [REPORTED]);
  });

  it("refuses a user report that names a different account than its target", async () => {
    const { client, writes, bans } = fakeAdmin(
      { target_type: "user", target_id: REPORTED, reported_user_id: "user-innocent" },
      {},
    );
    assert.equal((await suspendReportedUser("report-1", deps(client))).error, SUSPEND_AUTHOR_MISMATCH);
    assert.equal(bans.length, 0);
    assert.equal(writes.length, 0);
  });

  it("bans the author, hides their posts and stamps the report", async () => {
    const { client, writes, bans } = fakeAdmin();
    const result = await suspendReportedUser("report-1", deps(client));
    assert.deepEqual(result, {});

    assert.deepEqual(bans, [{ id: REPORTED, attrs: { ban_duration: SUSPEND_BAN_DURATION } }]);
    assert.equal(SUSPEND_BAN_DURATION, "876000h");

    const posts = writes.find((write) => write.table === "posts");
    assert.ok(posts, "posts are hidden");
    assert.equal(posts.row.hidden_by, MOD);
    assert.equal(typeof posts.row.hidden_at, "string");
    assert.deepEqual(posts.filters, [`user_id=${REPORTED}`, "hidden_at is null"]);

    const report = writes.find((write) => write.table === "reports");
    assert.ok(report, "the report is stamped");
    assert.equal(report.row.status, "actioned");
    assert.equal(report.row.reviewed_by, MOD);
    assert.deepEqual(report.filters, ["id=report-1"]);

    assert.deepEqual(
      writes.map((write) => write.table),
      ["posts", "reports"],
      "posts hide before the report is stamped",
    );
    assert.ok(!writes.some((write) => write.table === "comments"), "replies stay visible");
  });

  it("stops when the report is gone", async () => {
    const { client, writes, bans } = fakeAdmin(null);
    const result = await suspendReportedUser("report-1", deps(client));
    assert.equal(result.error, "That report is gone.");
    assert.equal(bans.length, 0);
    assert.equal(writes.length, 0);
  });
});
