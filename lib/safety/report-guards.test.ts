import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  REPORT_DAILY_LIMIT,
  REPORT_LIMIT_MESSAGE,
  REPORT_TARGET_GONE,
  reportCapReached,
  reportedAccount,
  type AuthorLookup,
} from "./report";

function lookup(rows: Record<string, Record<string, string>>) {
  const calls: string[] = [];
  const fn: AuthorLookup = async (table, id) => {
    calls.push(`${table}:${id}`);
    return { userId: rows[table]?.[id] ?? null };
  };
  return { fn, calls };
}

describe("reportedAccount", () => {
  it("uses the post's author, not the id the client sent", async () => {
    const { fn, calls } = lookup({ posts: { "post-1": "author-1" } });
    assert.deepEqual(await reportedAccount("post", "post-1", fn), { userId: "author-1" });
    assert.deepEqual(calls, ["posts:post-1"]);
  });

  it("uses the reply's author from comments", async () => {
    const { fn, calls } = lookup({ comments: { "reply-1": "author-2" } });
    assert.deepEqual(await reportedAccount("reply", "reply-1", fn), { userId: "author-2" });
    assert.deepEqual(calls, ["comments:reply-1"]);
  });

  it("uses the target of a user report without a lookup", async () => {
    const { fn, calls } = lookup({});
    assert.deepEqual(await reportedAccount("user", " user-3 ", fn), { userId: "user-3" });
    assert.deepEqual(calls, []);
  });

  it("refuses a target that's gone, a failed read and an unknown type", async () => {
    assert.deepEqual(await reportedAccount("post", "gone", lookup({}).fn), { error: REPORT_TARGET_GONE });
    const failing: AuthorLookup = async () => ({ userId: null, error: "read failed" });
    assert.deepEqual(await reportedAccount("reply", "reply-1", failing), { error: "read failed" });
    assert.deepEqual(await reportedAccount("card", "x", lookup({}).fn), {
      error: "That report target isn't supported.",
    });
  });
});

describe("reportCapReached", () => {
  const NOW = Date.parse("2026-11-03T12:00:00Z");

  it("counts the reporter's own rows from the last 24 hours", async () => {
    const seen: [string, string][] = [];
    await reportCapReached("me", async (id, since) => {
      seen.push([id, since]);
      return 0;
    }, NOW);
    assert.deepEqual(seen, [["me", "2026-11-02T12:00:00.000Z"]]);
  });

  it("refuses from the 21st report and allows up to 20", async () => {
    assert.equal(REPORT_DAILY_LIMIT, 20);
    assert.equal(await reportCapReached("me", async () => 19, NOW), false);
    assert.equal(await reportCapReached("me", async () => 20, NOW), true);
    assert.equal(REPORT_LIMIT_MESSAGE, "You've sent a lot of reports today. Try again tomorrow");
  });

  it("lets a report through when the count fails", async () => {
    assert.equal(await reportCapReached("me", async () => null, NOW), false);
  });
});

describe("submitReport wiring", () => {
  const source = readFileSync(join(process.cwd(), "lib/safety/actions.ts"), "utf8");
  const fn = source.slice(source.indexOf("export async function submitReport"), source.indexOf("export async function blockAccount"));

  it("checks the cap, then the author, before saving, all with the session client", () => {
    const cap = fn.indexOf("reportCapReached(");
    const author = fn.indexOf("reportedAccount(");
    const save = fn.indexOf("saveReport(");
    assert.ok(cap > 0 && author > cap && save > author);
    assert.match(fn, /\.eq\("reporter_id", reporterId\)/);
    assert.match(fn, /\.gte\("created_at", since\)/);
    assert.doesNotMatch(fn, /createSupabaseAdmin/);
  });

  it("never saves the client's reportedUserId", () => {
    assert.match(fn, /reportedUserId: account\.userId,/);
    assert.doesNotMatch(fn, /reportedUserId: input\.reportedUserId/);
  });
});
