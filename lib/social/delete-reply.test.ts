import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canDeleteReply,
  localDeleteComment,
  stateAfterReplyDelete,
  type LocalDb,
} from "./local-db";
import { remoteDeleteComment } from "./remote";
import type { Notification, PostComment, PostLike, PostRepost } from "./types";

const AUTHOR = "author";
const OTHER = "other";
const POST = "p1";

function comment(id: string, authorId: string): PostComment {
  return { id, postId: POST, authorId, body: "Reply", createdAt: id };
}

function note(id: string, postId: string): Notification {
  return {
    id,
    recipientId: "post-owner",
    actorId: AUTHOR,
    kind: "like",
    postId,
    preview: null,
    createdAt: id,
    read: false,
  };
}

function db(over: Partial<LocalDb> = {}): LocalDb {
  return {
    users: [],
    sessionUserId: AUTHOR,
    follows: [],
    posts: [],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    collections: {},
    ...over,
  };
}

function commentsClient(result: {
  data: { id: string }[] | null;
  error: { message: string } | null;
}) {
  const ops: string[] = [];
  const supabase = {
    from(table: string) {
      ops.push(`from:${table}`);
      const api = {
        delete() {
          ops.push("delete");
          return api;
        },
        eq(column: string, value: string) {
          ops.push(`eq:${column}=${value}`);
          return api;
        },
        select(columns: string) {
          ops.push(`select:${columns}`);
          return Promise.resolve(result);
        },
      };
      return api;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, ops };
}

describe("delete reply visibility", () => {
  it("shows Delete only to the reply author", () => {
    assert.equal(canDeleteReply(AUTHOR, AUTHOR), true);
    assert.equal(canDeleteReply(OTHER, AUTHOR), false);
    assert.equal(canDeleteReply("post-owner", AUTHOR), false);
    assert.equal(canDeleteReply(null, AUTHOR), false);
    assert.equal(canDeleteReply(undefined, AUTHOR), false);

    const page = readFileSync(join(process.cwd(), "components/post-view.tsx"), "utf8");
    const gate = page.slice(page.indexOf("canDeleteReply(user?.id, reply.authorId)"));
    assert.ok(gate.indexOf("<ReplyMenu") < gate.indexOf(": ("));
    assert.match(gate, /<SafetyMenu/);
    const menu = page.slice(page.indexOf("function ReplyMenu"), page.indexOf("function LaneTab"));
    assert.match(menu, /Delete reply/);
    assert.match(menu, /Delete this reply\?/);
    assert.match(menu, /deleteComment\(reply\.id\)/);
    assert.doesNotMatch(page.slice(0, page.indexOf("function ReplyMenu")), /Delete reply/);
    assert.match(page, /Reply deleted/);
    assert.match(page, /role="status"/);
  });
});

describe("delete reply rows", () => {
  it("lowers the reply count and clears likes, reposts, and notifications for that reply", () => {
    const before = db({
      comments: [comment("c1", AUTHOR), comment("c2", OTHER), comment("c3", AUTHOR)],
      likes: [
        { postId: "c1", userId: "fan", createdAt: "1" },
        { postId: POST, userId: "fan", createdAt: "1" },
      ],
      reposts: [
        { postId: "c1", userId: "fan", createdAt: "1" },
        { postId: POST, userId: "fan", createdAt: "1" },
      ],
      notifications: [note("n-reply", "c1"), note("n-post", POST)],
    });
    const removed = localDeleteComment(before, "c1");
    assert.equal(removed.error, undefined);
    assert.equal(removed.db.comments.filter((item) => item.postId === POST).length, 2);
    assert.equal(removed.db.comments.some((item) => item.id === "c1"), false);
    assert.equal(removed.db.comments.some((item) => item.id === "c2"), true);
    assert.equal(removed.db.likes.some((item) => item.postId === "c1"), false);
    assert.equal(removed.db.likes.some((item) => item.postId === POST), true);
    assert.equal(removed.db.reposts.some((item) => item.postId === "c1"), false);
    assert.equal(removed.db.reposts.some((item) => item.postId === POST), true);
    assert.equal(removed.db.notifications.some((item) => item.postId === "c1"), false);
    assert.equal(removed.db.notifications.some((item) => item.id === "n-post"), true);

    const mention: Notification = {
      ...note("n-mention", POST),
      kind: "mention",
      metadata: { source: "reply" },
      preview: "Reply",
      createdAt: "c1",
    };
    const withMention = localDeleteComment(
      db({ comments: [comment("c1", AUTHOR)], notifications: [mention] }),
      "c1",
    );
    assert.equal(withMention.error, undefined);
    assert.deepEqual(withMention.db.notifications, [mention]);

    const denied = localDeleteComment(before, "c2");
    assert.match(denied.error ?? "", /own replies/);
    assert.equal(denied.db.comments.length, 3);
  });

  it("puts the reply and its related rows back when delete fails", () => {
    const before = {
      comments: [comment("c1", AUTHOR), comment("c2", OTHER)],
      likes: [{ postId: "c1", userId: "fan", createdAt: "1" }] as PostLike[],
      reposts: [{ postId: "c1", userId: "fan", createdAt: "1" }] as PostRepost[],
      notifications: [note("n1", "c1")],
    };
    const optimistic = stateAfterReplyDelete(before, "c1", {});
    assert.equal(optimistic.comments.filter((item) => item.postId === POST).length, 1);
    assert.equal(optimistic.likes.length, 0);
    const rolled = stateAfterReplyDelete(before, "c1", { error: "Could not delete that reply." });
    assert.equal(rolled, before);
    assert.equal(rolled.comments.length, 2);
    assert.equal(rolled.likes.length, 1);
    assert.equal(rolled.reposts.length, 1);
    assert.equal(rolled.notifications.length, 1);
  });
});

describe("remote delete comment", () => {
  it("deletes that comment as its author", async () => {
    const client = commentsClient({ data: [{ id: "c1" }], error: null });
    const result = await remoteDeleteComment(client.supabase, AUTHOR, "c1");
    assert.deepEqual(result, {});
    assert.deepEqual(client.ops, [
      "from:comments",
      "delete",
      "eq:id=c1",
      "eq:user_id=author",
      "select:id",
    ]);
  });

  it("fails when RLS returns 0 rows or a policy error, and the reply list rolls back", async () => {
    const before = {
      comments: [comment("c1", AUTHOR), comment("c2", OTHER)],
      likes: [] as PostLike[],
      reposts: [] as PostRepost[],
      notifications: [] as Notification[],
    };
    const optimistic = stateAfterReplyDelete(before, "c1", {});
    assert.equal(optimistic.comments.length, 1);

    const empty = commentsClient({ data: [], error: null });
    const none = await remoteDeleteComment(empty.supabase, AUTHOR, "c1");
    assert.equal(none.error, "Could not delete that reply.");
    const restored = stateAfterReplyDelete(before, "c1", none);
    assert.equal(restored.comments.length, 2);
    assert.equal(restored, before);

    const rls = commentsClient({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    const blocked = await remoteDeleteComment(rls.supabase, AUTHOR, "c1");
    assert.equal(blocked.error, "You can only delete your own replies.");
    assert.equal(stateAfterReplyDelete(before, "c1", blocked), before);
  });
});

describe("delete reply wiring", () => {
  it("uses the shared rollback helper in the social provider", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /stateAfterReplyDelete\(before, commentId, \{\}\)/);
    assert.match(provider, /publish\(stateAfterReplyDelete\(before, commentId, result\)\)/);
    assert.match(provider, /stateAfterReplyDelete\(before, commentId, failed\)/);
    assert.match(provider, /remoteDeleteComment/);
    assert.match(provider, /localDeleteComment/);
  });

  it("already has an author delete policy on comments", () => {
    const created = readFileSync(
      join(process.cwd(), "supabase/migrations/20261017240000_safety_blocks_mutes_reports.sql"),
      "utf8",
    );
    assert.match(
      created,
      /create policy "Delete own comments" on public\.comments\s+for delete using \(auth\.uid\(\) = user_id\)/,
    );
    const later = readdirSync(join(process.cwd(), "supabase/migrations")).filter(
      (name) => name > "20261017240000_safety_blocks_mutes_reports.sql",
    );
    for (const name of later) {
      const sql = readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
      assert.doesNotMatch(sql, /drop policy if exists "Delete own comments"/, name);
    }
  });
});
