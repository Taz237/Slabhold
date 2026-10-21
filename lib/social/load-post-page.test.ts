import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POST_PAGE_QUOTE_LIMIT,
  loadPostPage,
  mergePostPageIntoSnapshot,
  postPageId,
} from "./load-post-page";
import {
  createRememberedPosts,
  findKnownPost,
  mergeRememberedSnapshot,
  storeRemembered,
} from "./remembered-posts";
import type { Notification, Post, Profile, SocialSnapshot } from "./types";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const REPLY = "33333333-3333-4333-8333-333333333333";
const MUTED = "44444444-4444-4444-8444-444444444444";
const BLOCKED = "55555555-5555-4555-8555-555555555555";
const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NESTED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUOTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Call = { table: string; op: string; args: unknown[] };

function postRow(
  id: string,
  userId: string,
  content: string,
  quotedPostId: string | null = null,
) {
  return {
    id,
    user_id: userId,
    content,
    image_url: null,
    card: null,
    quoted_post_id: quotedPostId,
    created_at: "2026-10-01T00:00:00.000Z",
    post_type: "post",
    show_paid: false,
    meta: null,
  };
}

function profileRow(id: string, username: string) {
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

function fakeClient(input: {
  session?: { id: string; email: string } | null;
  tables: Record<string, Record<string, unknown>[]>;
  counts?: Partial<Record<string, number>>;
}) {
  const calls: Call[] = [];
  const session = input.session === undefined ? null : input.session;
  const supabase = {
    auth: {
      async getSession() {
        calls.push({ table: "auth", op: "getSession", args: [] });
        return {
          data: {
            session: session ? { user: { id: session.id, email: session.email } } : null,
          },
        };
      },
    },
    from(table: string) {
      const state = { head: false };
      const api = {
        select(columns: string, options?: { head?: boolean }) {
          calls.push({ table, op: "select", args: [columns, options ?? null] });
          state.head = Boolean(options?.head);
          return api;
        },
        eq(column: string, value: unknown) {
          calls.push({ table, op: "eq", args: [column, value] });
          return api;
        },
        in(column: string, values: readonly string[]) {
          calls.push({ table, op: "in", args: [column, [...values]] });
          return api;
        },
        order(column: string, options: { ascending: boolean }) {
          calls.push({ table, op: "order", args: [column, options] });
          return api;
        },
        limit(count: number) {
          calls.push({ table, op: "limit", args: [count] });
          return api;
        },
        not(column: string, operator: string, value: string) {
          calls.push({ table, op: "not", args: [column, operator, value] });
          return api;
        },
        or(filters: string) {
          calls.push({ table, op: "or", args: [filters] });
          return api;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          const payload = state.head
            ? { data: null, error: null, count: input.counts?.[table] ?? 0 }
            : { data: input.tables[table] ?? [], error: null, count: null };
          return Promise.resolve(payload).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls };
}

function selects(calls: Call[], table: string) {
  return calls.filter((call) => call.table === table && call.op === "select");
}

function snapshotShell(over: Partial<SocialSnapshot> = {}): SocialSnapshot {
  return {
    user: null,
    profiles: [],
    posts: [],
    follows: [],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    publicCards: [],
    ...over,
  };
}

describe("post page route", () => {
  it("matches only /posts/[id]", () => {
    assert.equal(postPageId("/posts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), POST);
    assert.equal(postPageId(`/posts/${encodeURIComponent(POST)}`), POST);
    assert.equal(postPageId("/"), null);
    assert.equal(postPageId("/posts"), null);
    assert.equal(postPageId("/posts/abc/edit"), null);
    assert.equal(postPageId("/u/maya"), null);
  });
});

describe("loadPostPage", () => {
  const tables = {
    blocks: [{ blocked_id: BLOCKED }],
    mutes: [{ muted_id: MUTED }],
    posts: [
      postRow(POST, AUTHOR, "the post", QUOTED),
      postRow(QUOTED, AUTHOR, "original", NESTED),
      postRow(NESTED, AUTHOR, "older original"),
      postRow(QUOTE, REPLY, "quoting it", POST),
      postRow("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", BLOCKED, "blocked quote", POST),
    ],
    comments: [
      {
        id: "c1",
        post_id: POST,
        user_id: REPLY,
        body: "nice",
        created_at: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "c2",
        post_id: POST,
        user_id: MUTED,
        body: "hidden",
        created_at: "2026-10-02T01:00:00.000Z",
      },
      {
        id: "c3",
        post_id: POST,
        user_id: BLOCKED,
        body: "nope",
        created_at: "2026-10-02T02:00:00.000Z",
      },
    ],
    reposts: [
      { user_id: VIEWER, post_id: POST, created_at: "2026-10-03T00:00:00.000Z" },
      { user_id: BLOCKED, post_id: POST, created_at: "2026-10-03T01:00:00.000Z" },
    ],
    profiles: [
      profileRow(VIEWER, "me"),
      profileRow(AUTHOR, "author"),
      profileRow(REPLY, "reply"),
      profileRow(MUTED, "muted"),
      profileRow(BLOCKED, "blocked"),
    ],
    follows: [{ follower_id: VIEWER, following_id: AUTHOR }],
    notifications: [
      { id: "n1", recipient_id: VIEWER, read: false },
      { id: "n2", recipient_id: VIEWER, read: false },
    ],
    messages: [{ id: "m1", receiver_id: VIEWER, read: false, content: "secret" }],
    public_cards: [{ id: "card-1" }],
  };

  it("loads one post for a signed-out visitor without the home snapshot", async () => {
    const { supabase, calls } = fakeClient({ tables });
    const page = await loadPostPage(supabase, POST);
    assert.equal(page.found, true);
    assert.equal(page.snapshot.user, null);
    assert.equal(page.snapshot.posts.find((post) => post.id === POST)?.body, "the post");
    assert.equal(page.snapshot.posts.find((post) => post.id === QUOTED)?.body, "original");
    assert.equal(page.snapshot.posts.find((post) => post.id === NESTED)?.body, "older original");
    assert.equal(page.snapshot.posts.some((post) => post.id === QUOTE), true);
    assert.deepEqual(
      page.snapshot.comments.map((comment) => comment.id),
      ["c1", "c2", "c3"],
    );
    assert.equal(page.snapshot.reposts.some((repost) => repost.userId === VIEWER), true);
    assert.equal(page.snapshot.follows.length, 0);
    assert.equal(page.snapshot.notifications.length, 0);
    assert.equal(page.snapshot.messages.length, 0);
    assert.equal(page.snapshot.publicCards.length, 0);
    assert.deepEqual(page.snapshot.homePosts, []);
    assert.equal(page.snapshot.unreadNotificationCount, undefined);
    assert.equal(page.snapshot.unreadMessageCount, undefined);

    const tablesHit = [...new Set(calls.map((call) => call.table))];
    assert.deepEqual(tablesHit.sort(), ["auth", "comments", "posts", "profiles", "reposts"]);
    assert.equal(selects(calls, "posts").length, 4);
    assert.equal(
      calls.filter((call) => call.op === "limit").some((call) => call.args[0] === POST_PAGE_QUOTE_LIMIT),
      true,
    );
    assert.equal(
      calls.some((call) => call.table === "posts" && call.op === "limit" && call.args[0] === 100 && !calls.some(
        (other) => other.table === "posts" && other.op === "eq" && other.args[0] === "quoted_post_id",
      )),
      false,
    );
  });

  it("loads block and mute ids, viewer repost state, and badge counts for a signed-in viewer", async () => {
    const { supabase, calls } = fakeClient({
      session: { id: VIEWER, email: "me@example.com" },
      tables,
      counts: { notifications: 4, messages: 2 },
    });
    const page = await loadPostPage(supabase, POST);
    assert.equal(page.found, true);
    assert.equal(page.snapshot.user?.id, VIEWER);
    assert.equal(page.snapshot.user?.email, "me@example.com");
    assert.deepEqual(page.snapshot.blockedIds, [BLOCKED]);
    assert.deepEqual(page.snapshot.mutedIds, [MUTED]);
    assert.equal(page.snapshot.posts.some((post) => post.authorId === BLOCKED), false);
    assert.deepEqual(
      page.snapshot.comments.map((comment) => comment.authorId),
      [REPLY],
    );
    assert.deepEqual(
      page.snapshot.reposts.map((repost) => repost.userId),
      [VIEWER],
    );
    assert.equal(page.snapshot.unreadNotificationCount, 4);
    assert.equal(page.snapshot.unreadMessageCount, 2);
    assert.equal(page.snapshot.notifications.length, 0);
    assert.equal(page.snapshot.messages.length, 0);
    assert.equal(page.snapshot.follows.length, 0);
    assert.equal(page.snapshot.publicCards.length, 0);
    assert.deepEqual(page.snapshot.homePosts, []);

    const noteSelect = selects(calls, "notifications");
    const messageSelect = selects(calls, "messages");
    assert.equal(noteSelect.length, 1);
    assert.deepEqual(noteSelect[0]?.args[1], { count: "exact", head: true });
    assert.equal(messageSelect.length, 1);
    assert.deepEqual(messageSelect[0]?.args[1], { count: "exact", head: true });
    assert.equal(calls.some((call) => call.table === "follows"), false);
    assert.equal(calls.some((call) => call.table === "public_cards"), false);
    assert.equal(
      calls.some((call) => call.op === "select" && call.args[0] === "*"),
      false,
    );
    const commentNot = calls.find((call) => call.table === "comments" && call.op === "not");
    assert.match(String(commentNot?.args[2]), new RegExp(MUTED));
    assert.match(String(commentNot?.args[2]), new RegExp(BLOCKED));
    const postNot = calls.find((call) => call.table === "posts" && call.op === "not");
    assert.match(String(postNot?.args[2]), new RegExp(BLOCKED));
    assert.equal(String(postNot?.args[2]).includes(MUTED), false);

    const postLimits = calls.filter((call) => call.table === "posts" && call.op === "limit");
    assert.deepEqual(
      postLimits.map((call) => call.args[0]),
      [POST_PAGE_QUOTE_LIMIT],
    );
    assert.equal(
      calls.some(
        (call) => call.table === "posts" && call.op === "eq" && call.args[0] === "quoted_post_id",
      ),
      true,
    );
  });

  it("does not query posts when the id is not a uuid", async () => {
    const { supabase, calls } = fakeClient({
      session: { id: VIEWER, email: "me@example.com" },
      tables,
      counts: { notifications: 1, messages: 0 },
    });
    const page = await loadPostPage(supabase, "post-maya-1");
    assert.equal(page.found, false);
    assert.equal(page.snapshot.user?.id, VIEWER);
    assert.equal(page.snapshot.posts.length, 0);
    assert.equal(calls.some((call) => call.table === "posts"), false);
    assert.equal(calls.some((call) => call.table === "comments"), false);
    assert.equal(page.snapshot.unreadNotificationCount, 1);
  });
});

describe("mergePostPageIntoSnapshot", () => {
  it("keeps the home window, follows, and notification rows", () => {
    const homePost: Post = {
      id: "home",
      authorId: AUTHOR,
      body: "feed",
      imageDataUrl: null,
      card: null,
      quotedPostId: null,
      createdAt: "2026-10-04T00:00:00.000Z",
    };
    const opened: Post = {
      id: POST,
      authorId: AUTHOR,
      body: "opened",
      imageDataUrl: null,
      card: null,
      quotedPostId: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const note: Notification = {
      id: "n1",
      recipientId: VIEWER,
      actorId: AUTHOR,
      kind: "like",
      postId: POST,
      preview: null,
      createdAt: "2026-10-04T00:00:00.000Z",
      read: false,
    };
    const existing = snapshotShell({
      user: {
        id: VIEWER,
        email: "me@example.com",
        username: "me",
        displayName: "Me",
        bio: "",
        avatarDataUrl: null,
        coverDataUrl: null,
        accent: "#7c5cff",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      posts: [homePost, opened],
      profiles: [],
      follows: [{ followerId: VIEWER, followingId: AUTHOR, createdAt: "2026-01-02T00:00:00.000Z" }],
      notifications: [note],
      messages: [
        {
          id: "m1",
          senderId: AUTHOR,
          receiverId: VIEWER,
          content: "hi",
          createdAt: "2026-01-03T00:00:00.000Z",
          read: false,
        },
      ],
      homePosts: [homePost],
      comments: [
        {
          id: "old",
          postId: POST,
          authorId: REPLY,
          body: "stale",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const merged = mergePostPageIntoSnapshot(
      existing,
      snapshotShell({
        posts: [opened],
        comments: [
          {
            id: "new",
            postId: POST,
            authorId: REPLY,
            body: "fresh",
            createdAt: "2026-10-05T00:00:00.000Z",
          },
        ],
        reposts: [{ postId: POST, userId: VIEWER, createdAt: "2026-10-05T00:00:00.000Z" }],
        blockedIds: [],
        mutedIds: [],
        unreadNotificationCount: 9,
        unreadMessageCount: 9,
      }),
      POST,
    );
    assert.equal(merged.posts.some((post) => post.id === "home"), true);
    assert.equal(merged.homePosts?.[0]?.id, "home");
    assert.equal(merged.follows.length, 1);
    assert.equal(merged.notifications.length, 1);
    assert.equal(merged.messages.length, 1);
    assert.equal(merged.unreadNotificationCount, undefined);
    assert.deepEqual(
      merged.comments.map((comment) => comment.id),
      ["new"],
    );
    assert.equal(merged.reposts[0]?.userId, VIEWER);
  });
});

describe("remembered posts", () => {
  it("still finds a post loaded outside the home window after a refresh", () => {
    const memory = createRememberedPosts();
    const old: Post = {
      id: POST,
      authorId: AUTHOR,
      body: "from last year",
      imageDataUrl: null,
      card: null,
      quotedPostId: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const author: Profile = {
      id: AUTHOR,
      email: "",
      username: "author",
      displayName: "Author",
      bio: "",
      avatarDataUrl: null,
      coverDataUrl: null,
      accent: "#7c5cff",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    storeRemembered(memory, [old], [author], new Set());
    const refreshed = mergeRememberedSnapshot(
      snapshotShell({
        posts: [],
        profiles: [],
        blockedIds: [],
      }),
      memory,
      new Set(),
    );
    assert.equal(findKnownPost(refreshed.posts, memory, POST)?.body, "from last year");
  });
});

describe("post page wiring", () => {
  it("does not refresh the global snapshot just to open one post", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const view = readFileSync(join(process.cwd(), "components/post-view.tsx"), "utf8");
    assert.match(provider, /loadPostPage/);
    assert.match(provider, /postPageId/);
    assert.match(provider, /scopeRef\.current === "full"/);
    assert.doesNotMatch(view, /loadPostById/);
    assert.doesNotMatch(view, /void refresh\(\)/);
    assert.match(view, /postLoading/);
  });
});
