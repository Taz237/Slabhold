import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUSPEND_BAN_DURATION, suspendReportedUser } from "./moderation";

const MOD = "mod-1";
const OTHER_ADMIN = "mod-2";
const REPORTED = "user-bad";

type Write = { table: string; row: Record<string, unknown>; filters: string[] };

/** Fake service-role client. Never talks to Supabase. */
function fakeAdmin(reportedUserId: string | null = REPORTED) {
  const writes: Write[] = [];
  const bans: { id: string; attrs: Record<string, unknown> }[] = [];
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
      let write: Write | null = null;
      const query = {
        select() {
          return query;
        },
        update(row: Record<string, unknown>) {
          write = { table, row, filters };
          writes.push(write);
          return query;
        },
        eq(column: string, value: string) {
          filters.push(`${column}=${value}`);
          return query;
        },
        is(column: string, value: null) {
          filters.push(`${column} is ${value}`);
          return query;
        },
        async maybeSingle() {
          return { data: reportedUserId ? { reported_user_id: reportedUserId } : null, error: null };
        },
        then(resolve: (value: { error: null }) => unknown) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, writes, bans };
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
      const { client, writes, bans } = fakeAdmin(id);
      const result = await suspendReportedUser("report-1", deps(client));
      assert.equal(result.error, "You can't suspend a moderator account.");
      assert.equal(bans.length, 0);
      assert.equal(writes.length, 0);
    }
  });

  it("bans the reported account, hides their posts and stamps the report", async () => {
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
  });

  it("stops when the report is gone", async () => {
    const { client, writes, bans } = fakeAdmin(null);
    const result = await suspendReportedUser("report-1", deps(client));
    assert.equal(result.error, "That report is gone.");
    assert.equal(bans.length, 0);
    assert.equal(writes.length, 0);
  });
});
