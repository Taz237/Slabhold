import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPostPage, postPageAuthorFilters } from "./load-feed-page";
import { postIdFromPath } from "./post-route";
import { createSnapshotRefresher, shouldMarkSnapshotReady } from "./snapshot-refresh";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const QUOTED_AUTHOR = "33333333-3333-4333-8333-333333333333";
const REPLY_AUTHOR = "44444444-4444-4444-8444-444444444444";
const BLOCKED = "55555555-5555-4555-8555-555555555555";
const MUTED = "66666666-6666-4666-8666-666666666666";
const BOTH = "77777777-7777-4777-8777-777777777777";
const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REPLY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUOTING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const QUOTE_REPLY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Call =
  | { kind: "session" }
  | { kind: "rpc"; fn: string; args: unknown }
  | { kind: "table"; table: string; ops: string[] };

function profile(id: string, username: string) {
  return {
    id,
    username,
    display_name: username,
    bio: "",
    avatar_url: null,
    cover_url: null,
    accent: "#7c5cff",
    created_at: "2026-10-01T00:00:00.000Z",
  };
}

function postRow(id: string, userId: string, quotedPostId: string | null) {
  return {
    id,
    user_id: userId,
    content: id === POST ? "Hello" : "Quoted",
    image_url: null,
    card: null,
    quoted_post_id: quotedPostId,
    created_at: "2026-10-21T12:00:00.000Z",
    post_type: "post",
    show_paid: false,
    meta: null,
  };
}

function rowsFor(table: string, ops: string[]) {
  const joined = ops.join("|");
  if (table === "blocks") return [{ blocked_id: BLOCKED }];
  if (table === "mutes") return [{ muted_id: MUTED }];
  if (table === "comments") {
    const rows = [];
    if (joined.includes(`eq:post_id:${POST}`) || joined.includes(`in:post_id:${POST}`)) {
      rows.push({
        id: REPLY,
        post_id: POST,
        user_id: REPLY_AUTHOR,
        body: "nice",
        created_at: "2026-10-21T12:01:00.000Z",
      });
    }
    if (joined.includes(QUOTING)) {
      rows.push({
        id: QUOTE_REPLY,
        post_id: QUOTING,
        user_id: REPLY_AUTHOR,
        body: "on the quote",
        created_at: "2026-10-21T12:01:30.000Z",
      });
    }
    return rows;
  }
  if (table === "reposts") {
    const rows = [{ user_id: VIEWER, post_id: POST, created_at: "2026-10-21T12:02:00.000Z" }];
    if (joined.includes(QUOTING)) {
      rows.push({ user_id: VIEWER, post_id: QUOTING, created_at: "2026-10-21T12:03:00.000Z" });
    }
    return rows;
  }
  if (table === "notifications") {
    return [
      {
        id: "n-unread",
        recipient_id: VIEWER,
        actor_id: AUTHOR,
        kind: "like",
        post_id: POST,
        preview: "Hello",
        href: null,
        metadata: null,
        read: false,
        created_at: "2026-10-21T12:04:00.000Z",
      },
    ];
  }
  if (table === "messages") {
    return [
      {
        id: "m-unread",
        sender_id: AUTHOR,
        receiver_id: VIEWER,
        content: "hey",
        created_at: "2026-10-21T12:05:00.000Z",
        read: false,
      },
    ];
  }
  if (table === "profiles") {
    return [VIEWER, AUTHOR, QUOTED_AUTHOR, REPLY_AUTHOR]
      .filter((id) => joined.includes(id))
      .map((id) => profile(id, id.slice(0, 8)));
  }
  if (table === "posts") {
    if (joined.includes(`eq:quoted_post_id:${POST}`)) {
      return [postRow(QUOTING, AUTHOR, POST)];
    }
    if (joined.includes(QUOTE_TARGET)) return [postRow(QUOTE_TARGET, QUOTED_AUTHOR, null)];
    if (joined.includes(POST)) return [postRow(POST, AUTHOR, QUOTE_TARGET)];
  }
  return [];
}

function client(session: { id: string; email: string } | null) {
  const calls: Call[] = [];
  const supabase = {
    auth: {
      getSession() {
        calls.push({ kind: "session" });
        return Promise.resolve({
          data: { session: session ? { user: session } : null },
        });
      },
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ kind: "rpc", fn, args });
      if (fn === "hidden_author_ids") return Promise.resolve({ data: [BLOCKED, MUTED], error: null });
      return Promise.resolve({ data: null, error: { message: "missing" } });
    },
    from(table: string) {
      const ops: string[] = [];
      const builder = {
        select() {
          ops.push("select");
          return builder;
        },
        eq(column: string, value: unknown) {
          ops.push(`eq:${column}:${String(value)}`);
          return builder;
        },
        in(column: string, values: readonly string[]) {
          ops.push(`in:${column}:${values.join(",")}`);
          return builder;
        },
        order(column: string) {
          ops.push(`order:${column}`);
          return builder;
        },
        limit(count: number) {
          ops.push(`limit:${count}`);
          return builder;
        },
        not(column: string, operator: string, value: string) {
          ops.push(`not:${column}:${operator}:${value}`);
          return builder;
        },
        or(filters: string) {
          ops.push(`or:${filters}`);
          return builder;
        },
        then(
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          calls.push({ kind: "table", table, ops: [...ops] });
          return Promise.resolve({ data: rowsFor(table, ops), error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return builder;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls };
}

function tables(calls: Call[], table: string) {
  return calls.filter(
    (call): call is Extract<Call, { kind: "table" }> => call.kind === "table" && call.table === table,
  );
}

describe("post page route", () => {
  it("matches a post id and ignores the rest of the app", () => {
    assert.equal(postIdFromPath(`/posts/${POST}`), POST);
    assert.equal(postIdFromPath(`/posts/${POST}/`), POST);
    assert.equal(postIdFromPath(`/posts/${POST}?next=/`), POST);
    assert.equal(postIdFromPath("/"), null);
    assert.equal(postIdFromPath("/posts"), null);
    assert.equal(postIdFromPath("/notifications"), null);
    assert.equal(postIdFromPath("/posts/not-a-uuid"), null);
  });
});

describe("post page author filters", () => {
  it("keeps someone who is both blocked and muted off the post", () => {
    const filters = postPageAuthorFilters([BOTH, MUTED], [BLOCKED, BOTH], [MUTED, BOTH]);
    assert.deepEqual(filters.postHidden, [BLOCKED, BOTH]);
    assert.equal(filters.postHidden.includes(MUTED), false);
    assert.deepEqual(filters.replyHidden, [BOTH, MUTED, BLOCKED]);
  });
});

describe("loadPostPage", () => {
  it("loads one post, its people, replies, and the viewer's repost with a single hidden-author call", async () => {
    const fake = client({ id: VIEWER, email: "ada@example.com" });
    const page = await loadPostPage(fake.supabase, POST);

    assert.equal(page.post?.id, POST);
    assert.equal(page.post?.authorId, AUTHOR);
    assert.equal(page.post?.quotedPostId, QUOTE_TARGET);
    assert.equal(page.relatedPosts[0]?.id, QUOTE_TARGET);
    assert.equal(page.relatedPosts[0]?.authorId, QUOTED_AUTHOR);
    assert.equal(page.quotingPosts[0]?.id, QUOTING);
    assert.equal(page.comments.length, 2);
    assert.equal(page.comments.find((comment) => comment.postId === POST)?.authorId, REPLY_AUTHOR);
    assert.equal(page.comments.find((comment) => comment.postId === QUOTING)?.id, QUOTE_REPLY);
    assert.equal(page.user?.id, VIEWER);
    assert.equal(page.user?.email, "ada@example.com");
    assert.deepEqual(
      page.profiles.map((profile) => profile.id).sort(),
      [AUTHOR, QUOTED_AUTHOR, REPLY_AUTHOR, VIEWER].sort(),
    );
    assert.equal(page.reposts.filter((repost) => repost.postId === POST && repost.userId === VIEWER).length, 1);
    const quoteReposts = page.reposts.filter((repost) => repost.postId === QUOTING);
    assert.equal(quoteReposts.length, 1);
    assert.equal(quoteReposts[0]?.userId, VIEWER);
    assert.equal(page.notifications.filter((note) => note.recipientId === VIEWER && !note.read).length > 0, true);
    assert.equal(page.messages.filter((message) => message.receiverId === VIEWER && !message.read).length > 0, true);
    assert.deepEqual(page.blockedIds, [BLOCKED]);
    assert.deepEqual(page.mutedIds, [MUTED]);

    const sessions = fake.calls.filter((call) => call.kind === "session");
    const rpcs = fake.calls.filter((call): call is Extract<Call, { kind: "rpc" }> => call.kind === "rpc");
    assert.equal(sessions.length, 1);
    assert.equal(rpcs.length, 1);
    assert.equal(rpcs[0]?.fn, "hidden_author_ids");
    assert.deepEqual(rpcs[0]?.args, { apply_mute: true });

    assert.equal(tables(fake.calls, "profiles").length, 1);
    assert.equal(tables(fake.calls, "blocks").length, 1);
    assert.equal(tables(fake.calls, "mutes").length, 1);
    assert.equal(tables(fake.calls, "comments").length, 2);
    assert.equal(tables(fake.calls, "reposts").length, 1);
    assert.equal(tables(fake.calls, "notifications").length, 1);
    assert.equal(tables(fake.calls, "messages").length, 1);
    for (const name of ["follows", "public_cards", "likes"]) {
      assert.equal(tables(fake.calls, name).length, 0, name);
    }

    const posts = tables(fake.calls, "posts");
    assert.equal(posts.length, 3);
    for (const call of posts) {
      assert.ok(
        call.ops.some((op) => op.startsWith("in:id:") || op.startsWith("eq:quoted_post_id:")),
        call.ops.join(" "),
      );
      const hidden = call.ops.find((op) => op.startsWith("not:"));
      assert.equal(hidden?.includes(MUTED), false);
      assert.equal(hidden?.includes(BLOCKED), true);
    }

    const comments = tables(fake.calls, "comments")[0];
    assert.ok(comments?.ops.includes(`eq:post_id:${POST}`));
    const commentHidden = comments?.ops.find((op) => op.startsWith("not:"));
    assert.equal(commentHidden?.includes(BLOCKED), true);
    assert.equal(commentHidden?.includes(MUTED), true);

    const reposts = tables(fake.calls, "reposts")[0];
    const repostIds = reposts?.ops.find((op) => op.startsWith("in:post_id:"));
    assert.equal(repostIds?.includes(POST), true);
    assert.equal(repostIds?.includes(REPLY), true);
    assert.equal(repostIds?.includes(QUOTING), true);
    assert.equal(repostIds?.includes(QUOTE_TARGET), true);
    assert.equal(repostIds?.includes(QUOTE_REPLY), true);
    const repostHidden = reposts?.ops.find((op) => op.startsWith("not:"));
    assert.equal(repostHidden?.includes(MUTED), false);

    const notes = tables(fake.calls, "notifications")[0];
    assert.ok(notes?.ops.includes(`eq:recipient_id:${VIEWER}`));
    assert.ok(notes?.ops.includes("eq:read:false"));
    const noteSafety = notes?.ops.find((op) => op.startsWith("or:") || op.startsWith("not:"));
    assert.equal(noteSafety?.includes(BLOCKED), true);
    assert.equal(noteSafety?.includes(MUTED), true);
    const quoteComments = tables(fake.calls, "comments").find((call) =>
      call.ops.some((op) => op.startsWith("in:post_id:")),
    );
    assert.equal(quoteComments?.ops.find((op) => op.startsWith("in:post_id:"))?.includes(QUOTING), true);
    const messages = tables(fake.calls, "messages")[0];
    assert.ok(messages?.ops.includes(`eq:receiver_id:${VIEWER}`));
    assert.ok(messages?.ops.includes("eq:read:false"));
  });

  it("keeps a reposted quote reposted when the cold page reloads", async () => {
    const first = client({ id: VIEWER, email: "ada@example.com" });
    const opened = await loadPostPage(first.supabase, POST);
    const quoteReposts = opened.reposts.filter((repost) => repost.postId === QUOTING);
    assert.equal(quoteReposts.length, 1);
    assert.equal(quoteReposts[0]?.userId, VIEWER);
    assert.equal(opened.comments.filter((comment) => comment.postId === QUOTING).length, 1);

    const again = client({ id: VIEWER, email: "ada@example.com" });
    const reloaded = await loadPostPage(again.supabase, POST);
    const still = reloaded.reposts.filter((repost) => repost.postId === QUOTING && repost.userId === VIEWER);
    assert.equal(still.length, 1);
    assert.equal(reloaded.reposts.filter((repost) => repost.postId === QUOTING).length, 1);

    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const toggle = provider.slice(provider.indexOf("const toggleRepost"), provider.indexOf("const addComment"));
    assert.match(toggle, /await reloadRef\.current\(client\)/);
    assert.match(provider, /const page = await loadPostPage\(client, id\)/);
    assert.match(provider, /reposts: page\.reposts/);
    assert.match(provider, /comments: page\.comments/);
  });

  it("skips hidden authors, blocks, and mutes when signed out", async () => {
    const fake = client(null);
    const page = await loadPostPage(fake.supabase, POST);
    assert.equal(page.post?.id, POST);
    assert.equal(page.user, null);
    assert.deepEqual(page.blockedIds, []);
    assert.deepEqual(page.mutedIds, []);
    assert.equal(
      fake.calls.filter((call) => call.kind === "rpc").length,
      0,
    );
    assert.equal(tables(fake.calls, "blocks").length, 0);
    assert.equal(tables(fake.calls, "mutes").length, 0);
    assert.equal(tables(fake.calls, "notifications").length, 0);
    assert.equal(tables(fake.calls, "messages").length, 0);
    assert.equal(tables(fake.calls, "follows").length, 0);
    const comments = tables(fake.calls, "comments")[0];
    assert.equal(comments?.ops.some((op) => op.startsWith("not:")), false);
  });

  it("does not query anything for an id that is not a post", async () => {
    const fake = client({ id: VIEWER, email: "ada@example.com" });
    const page = await loadPostPage(fake.supabase, "nope");
    assert.equal(page.post, null);
    assert.equal(fake.calls.length, 0);
  });
});

describe("post page wiring", () => {
  it("does not refresh the site snapshot when the post screen opens", () => {
    const page = readFileSync(join(process.cwd(), "components/post-view.tsx"), "utf8");
    assert.match(page, /if \(!ready \|\| mode !== "local"\) return;\s*void refresh\(\)/);
    assert.doesNotMatch(page, /loadPostById/);
    assert.doesNotMatch(page, /loadSupabaseSocial/);
    assert.match(page, /loadingPostId/);

    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /loadPostPage\(/);
    assert.match(provider, /postIdFromPath\(pathname\)/);
    assert.match(provider, /event !== "SIGNED_IN" && event !== "SIGNED_OUT"/);
    assert.match(provider, /filter: `post_id=eq\.\$\{postId\}`/);
    assert.match(provider, /filter: `recipient_id=eq\.\$\{viewerId\}`/);
    assert.match(provider, /filter: `receiver_id=eq\.\$\{viewerId\}`/);
    assert.match(provider, /notifications: page\.notifications/);
    assert.match(provider, /messages: page\.messages/);
    assert.match(provider, /shouldMarkSnapshotReady\(fullSnapshotRef\.current\)/);
    assert.match(provider, /!hasFullSnapshot && ready/);
    assert.doesNotMatch(provider, /onAuthStateChange\(\(\) =>/);
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    assert.match(shell, /if \(user\)/);
    assert.match(shell, /showNav/);
  });
});

describe("leaving a cold post page", () => {
  it("does not mark home ready while a second refresh replaces the post-only snapshot", async () => {
    const refresh = createSnapshotRefresher<"post" | "stale" | "full">();
    let snapshot: "post" | "stale" | "full" = "post";
    let fullSnapshot = false;
    let ready = true;
    const pending = new Map<string, () => void>();
    function gate(name: string, value: "post" | "stale" | "full") {
      return new Promise<"post" | "stale" | "full">((resolve) => {
        pending.set(name, () => resolve(value));
      });
    }
    const apply = (value: "post" | "stale" | "full") => {
      snapshot = value;
      fullSnapshot = value === "full";
    };

    ready = false;
    const first = refresh(() => gate("first", "stale"), apply);
    const second = refresh(() => gate("second", "full"), apply);
    assert.equal(shouldMarkSnapshotReady(fullSnapshot), false);
    assert.equal(ready, false);
    assert.equal(snapshot, "post");

    pending.get("first")?.();
    await Promise.resolve();
    assert.equal(snapshot, "post");
    assert.equal(shouldMarkSnapshotReady(fullSnapshot), false);

    pending.get("second")?.();
    await second;
    await first;
    ready = shouldMarkSnapshotReady(fullSnapshot);
    assert.equal(snapshot, "full");
    assert.equal(ready, true);
    assert.notEqual(snapshot, "post");
  });
});
