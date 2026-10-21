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

function commentsClient(
  result: {
    data: { id: string; post_id?: string; body?: string }[] | null;
    error: { message: string } | null;
  },
  noteError: { message: string } | null = null,
) {
  const ops: string[] = [];
  const noteDeletes: { column: string; value: string }[][] = [];
  const supabase = {
    from(table: string) {
      ops.push(`from:${table}`);
      const filters: { column: string; value: string }[] = [];
      const api = {
        delete() {
          ops.push("delete");
          return api;
        },
        eq(column: string, value: string) {
          ops.push(`eq:${column}=${value}`);
          filters.push({ column, value });
          return api;
        },
        select(columns: string) {
          ops.push(`select:${columns}`);
          return Promise.resolve(result);
        },
        then(
          onFulfilled: (value: { data: null; error: { message: string } | null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve()
            .then(() => {
              if (table === "notifications") noteDeletes.push(filters);
              return { data: null, error: table === "notifications" ? noteError : null };
            })
            .then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, ops, noteDeletes };
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
    assert.deepEqual(withMention.db.notifications, []);

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

describe("deleted reply previews", () => {
  it("drops only the deleter's comment and reply-mention previews on that post", () => {
    const longBody = "m".repeat(90);
    const longPreview = `${"m".repeat(77)}…`;
    const long = comment("c-long", AUTHOR);
    long.body = longBody;
    const keep: Notification[] = [
      { ...note("n-like", POST), preview: "Reply" },
      {
        ...note("n-other-actor", POST),
        kind: "comment",
        actorId: OTHER,
        preview: "Reply",
      },
      {
        ...note("n-other-text", POST),
        kind: "comment",
        preview: "A different reply",
      },
      {
        ...note("n-other-post", "p2"),
        kind: "comment",
        preview: "Reply",
      },
      {
        ...note("n-post-mention", POST),
        kind: "mention",
        preview: "Reply",
        metadata: null,
      },
      {
        ...note("n-quote", POST),
        kind: "quote",
        preview: "Reply",
      },
    ];
    const drop: Notification[] = [
      { ...note("n-comment", POST), kind: "comment", preview: "Reply" },
      {
        ...note("n-reply-mention", POST),
        kind: "mention",
        preview: "Reply",
        metadata: { source: "reply" },
      },
      {
        ...note("n-long", POST),
        kind: "comment",
        preview: longPreview,
      },
    ];
    const removed = localDeleteComment(
      db({
        comments: [comment("c1", AUTHOR), long, comment("c2", OTHER)],
        notifications: [...keep, ...drop],
      }),
      "c1",
    );
    assert.equal(removed.error, undefined);
    assert.deepEqual(
      removed.db.notifications.map((item) => item.id),
      [...keep.map((item) => item.id), "n-long"],
    );
    const removedLong = localDeleteComment(removed.db, "c-long");
    assert.equal(removedLong.error, undefined);
    assert.deepEqual(
      removedLong.db.notifications.map((item) => item.id),
      keep.map((item) => item.id),
    );
  });

  it("puts a matching preview back when the reply delete fails", () => {
    const commentNote: Notification = {
      ...note("n-comment", POST),
      kind: "comment",
      preview: "Reply",
    };
    const before = {
      comments: [comment("c1", AUTHOR)],
      likes: [] as PostLike[],
      reposts: [] as PostRepost[],
      notifications: [commentNote],
    };
    const optimistic = stateAfterReplyDelete(before, "c1", {});
    assert.deepEqual(optimistic.notifications, []);
    const rolled = stateAfterReplyDelete(before, "c1", { error: "Could not delete that reply." });
    assert.equal(rolled, before);
    assert.equal(rolled.notifications.length, 1);
  });
});

describe("remote delete comment", () => {
  it("deletes that comment as its author and clears matching previews", async () => {
    const client = commentsClient({
      data: [{ id: "c1", post_id: POST, body: "Hello there" }],
      error: null,
    });
    const result = await remoteDeleteComment(client.supabase, AUTHOR, "c1");
    assert.deepEqual(result, {});
    assert.deepEqual(client.ops.slice(0, 5), [
      "from:comments",
      "delete",
      "eq:id=c1",
      "eq:user_id=author",
      "select:id, post_id, body",
    ]);
    assert.deepEqual(client.noteDeletes, [
      [
        { column: "actor_id", value: AUTHOR },
        { column: "post_id", value: POST },
        { column: "kind", value: "comment" },
        { column: "preview", value: "Hello there" },
      ],
      [
        { column: "actor_id", value: AUTHOR },
        { column: "post_id", value: POST },
        { column: "kind", value: "mention" },
        { column: "metadata->>source", value: "reply" },
        { column: "preview", value: "Hello there" },
      ],
    ]);
  });

  it("still reports success when notification cleanup is blocked", async () => {
    const longBody = "m".repeat(90);
    const client = commentsClient(
      { data: [{ id: "c1", post_id: POST, body: longBody }], error: null },
      { message: "new row violates row-level security policy" },
    );
    const result = await remoteDeleteComment(client.supabase, AUTHOR, "c1");
    assert.deepEqual(result, {});
    assert.equal(client.noteDeletes.length, 2);
    const preview = client.noteDeletes[0]?.find((filter) => filter.column === "preview")?.value;
    assert.equal(preview, `${"m".repeat(77)}…`);
    assert.equal(client.noteDeletes[1]?.find((filter) => filter.column === "kind")?.value, "mention");
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
    assert.equal(empty.noteDeletes.length, 0);
    const restored = stateAfterReplyDelete(before, "c1", none);
    assert.equal(restored.comments.length, 2);
    assert.equal(restored, before);

    const rls = commentsClient({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    const blocked = await remoteDeleteComment(rls.supabase, AUTHOR, "c1");
    assert.equal(blocked.error, "You can only delete your own replies.");
    assert.equal(rls.noteDeletes.length, 0);
    assert.equal(stateAfterReplyDelete(before, "c1", blocked), before);
  });

  it("does not tell people to re-run schema.sql, and keeps the bootstrap file runnable", () => {
    const remote = readFileSync(join(process.cwd(), "lib/social/remote.ts"), "utf8");
    assert.equal(remote.includes("schema.sql"), false);
    assert.match(remote, /Something went wrong on our side\. Please try again\./);
    assert.match(remote, /Your post was saved, but we couldn't notify everyone you mentioned\./);
    const schema = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");
    assert.match(
      schema,
      /Run ONCE on a NEW empty database, then apply supabase\/migrations in order\. Never re-run on an existing database\./,
    );
    assert.match(schema, /create table if not exists public\.notifications/);
    assert.match(schema, /create policy "Delete notifications you sent"/);
    assert.doesNotMatch(
      schema,
      /create policy "Comments are public" on public\.comments for select using \(true\)/,
    );
    assert.match(schema, /not private\.is_blocked\(auth\.uid\(\), user_id\)/);
    assert.match(
      schema,
      /not private\.is_blocked\(auth\.uid\(\), private\.post_author\(post_id\)\)/,
    );
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
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"));
    for (const name of migrations) {
      const sql = readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
      assert.doesNotMatch(sql, /drop policy if exists "Delete notifications you sent"/i, name);
      assert.doesNotMatch(sql, /revoke delete on public\.notifications/i, name);
    }
  });
});
