import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRealtimePatch } from "./realtime-slices";
import { applyRealtimePatch } from "./realtime-sync";
import { newestReplyAt, REPLY_PAGE_SIZE, visibleReplies } from "./reply-paging";
import type { PostComment, PostRepost } from "./types";

const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIEWER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const R1 = "33333333-3333-4333-8333-333333333331";
const R2 = "33333333-3333-4333-8333-333333333332";
const R3 = "33333333-3333-4333-8333-333333333333";

function reply(id: string, createdAt: string, postId = POST): PostComment {
  return { id, postId, authorId: OTHER, body: id, createdAt };
}

function fake(rowsFor: (ops: string[]) => Record<string, unknown>[]) {
  const calls: string[][] = [];
  const supabase = {
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      const ops: string[] = [`from:${table}`];
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "eq", "gt", "in", "order", "limit", "not", "or"]) {
        builder[name] = (...args: unknown[]) => {
          ops.push(`${name}:${args.map((arg) => (Array.isArray(arg) ? arg.join("|") : String(arg))).join(",")}`);
          return builder;
        };
      }
      builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        calls.push([...ops]);
        return Promise.resolve({ data: rowsFor(ops), error: null }).then(onFulfilled, onRejected);
      };
      return builder;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls };
}

const row = (id: string, created: string) => ({ id, post_id: POST, user_id: OTHER, body: id, created_at: created });

describe("live reply updates read only what changed", () => {
  it("reads replies newer than the newest one shown, never the whole list", async () => {
    const { supabase, calls } = fake((ops) => (ops.some((op) => op.startsWith("gt:")) ? [row(R3, "2026-11-11T10:03:00Z")] : []));
    const patch = await loadRealtimePatch(supabase, new Set(["comments"]), {
      viewerId: VIEWER,
      postId: POST,
      replies: { newestAt: "2026-11-11T10:02:00Z", touchedIds: [] },
    });
    const commentReads = calls.filter((ops) => ops[0] === "from:comments");
    assert.equal(commentReads.length, 1);
    assert.ok(commentReads[0].includes("gt:created_at,2026-11-11T10:02:00Z"), commentReads[0].join(" "));
    assert.ok(commentReads[0].some((op) => op.startsWith("limit:")));
    assert.equal(patch.comments, undefined, "no full replace");
    assert.deepEqual(patch.replyChanges?.upsert.map((item) => item.id), [R3]);
    assert.deepEqual(patch.replyChanges?.removeIds, []);
  });

  it("re-reads edited or deleted replies by id, and drops the ones that are gone or hidden", async () => {
    const { supabase, calls } = fake((ops) =>
      ops.some((op) => op.startsWith("in:id")) ? [{ ...row(R1, "2026-11-11T10:00:00Z"), body: "edited" }] : [],
    );
    const patch = await loadRealtimePatch(supabase, new Set(["comments"]), {
      viewerId: VIEWER,
      postId: POST,
      replies: { newestAt: "2026-11-11T10:02:00Z", touchedIds: [R1, R2] },
    });
    const byId = calls.find((ops) => ops.some((op) => op.startsWith("in:id")));
    assert.ok(byId);
    assert.equal(patch.replyChanges?.upsert.find((item) => item.id === R1)?.body, "edited");
    assert.deepEqual(patch.replyChanges?.removeIds, [R2]);
  });

  it("merges the changes into what is loaded, keeping every other reply", () => {
    const existing = {
      user: { id: VIEWER },
      notifications: [],
      messages: [],
      reposts: [] as PostRepost[],
      comments: [reply(R1, "1"), reply(R2, "2"), reply("other", "1", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")],
    };
    const next = applyRealtimePatch(existing, {
      postId: POST,
      replyChanges: { upsert: [{ ...reply(R1, "1"), body: "edited" }, reply(R3, "3")], removeIds: [R2] },
    });
    assert.deepEqual(next.comments.map((item) => item.id).sort(), [R1, R3, "other"].sort());
    assert.equal(next.comments.find((item) => item.id === R1)?.body, "edited");
  });

  it("knows the newest loaded reply, ignoring ones still sending", () => {
    assert.equal(newestReplyAt([reply(R1, "2026-11-11T10:00:00Z"), reply(R2, "2026-11-11T10:05:00Z"), reply("optimistic-x", "2026-11-11T11:00:00Z")], POST, (item) => item.id.startsWith("optimistic-")), "2026-11-11T10:05:00Z");
    assert.equal(newestReplyAt([], POST, () => false), null);
  });
});

describe("reply pages on the post screen", () => {
  it("shows 20, then 20 more each time", () => {
    const all = Array.from({ length: 45 }, (_, index) => reply(`r${index}`, String(index)));
    assert.equal(REPLY_PAGE_SIZE, 20);
    assert.equal(visibleReplies(all, 1).shown.length, 20);
    assert.equal(visibleReplies(all, 1).more, true);
    assert.equal(visibleReplies(all, 3).shown.length, 45);
    assert.equal(visibleReplies(all, 3).more, false);
  });
});
