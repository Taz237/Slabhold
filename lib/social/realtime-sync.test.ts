import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authSnapshotReload } from "./auth-snapshot";
import { MESSAGE_PAGE_SIZE } from "./remote";
import { loadRealtimePatch } from "./realtime-slices";
import { NOTIFICATION_PAGE_SIZE } from "./scoped-reads";
import {
  applyRealtimePatch,
  createRealtimeScheduler,
  REALTIME_DEBOUNCE_MS,
  realtimeBindings,
  shouldFetchPublicCatalog,
  type RealtimeSlice,
} from "./realtime-sync";
import type { DirectMessage, Notification, PostComment, PostRepost } from "./types";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("realtime listeners", () => {
  it("filters inbox listeners with the viewer id and drops app-wide comments and reposts", () => {
    const home = realtimeBindings({ viewerId: VIEWER, postId: null, fullSnapshot: true });
    assert.deepEqual(
      home.map((binding) => `${binding.table}:${binding.filter}`).sort(),
      [
        `messages:receiver_id=eq.${VIEWER}`,
        `messages:sender_id=eq.${VIEWER}`,
        `notifications:recipient_id=eq.${VIEWER}`,
      ].sort(),
    );
    assert.equal(
      home.some((binding) => binding.table === "comments" || binding.table === "reposts"),
      false,
    );

    const signedOut = realtimeBindings({ viewerId: null, postId: null, fullSnapshot: true });
    assert.deepEqual(signedOut, []);

    const post = realtimeBindings({ viewerId: VIEWER, postId: POST, fullSnapshot: true });
    assert.equal(
      post.some((binding) => binding.filter === `post_id=eq.${POST}` && binding.table === "comments"),
      true,
    );
    assert.equal(
      post.some((binding) => binding.filter === `post_id=eq.${POST}` && binding.table === "reposts"),
      true,
    );
    assert.equal(
      post.filter((binding) => binding.table === "notifications" || binding.table === "messages").every((binding) => binding.filter.includes(VIEWER)),
      true,
    );
  });

  it("does not reload while hidden and catches up once when the tab is visible", () => {
    const reloads: RealtimeSlice[][] = [];
    let hidden = true;
    const queued: { fn: (() => void) | null } = { fn: null };
    const fire = () => {
      const fn = queued.fn;
      if (fn) fn();
    };
    let scheduledMs = 0;
    const scheduler = createRealtimeScheduler({
      debounceMs: REALTIME_DEBOUNCE_MS,
      hidden: () => hidden,
      reload: (slices) => reloads.push([...slices].sort()),
      schedule: (fn, ms) => {
        queued.fn = fn;
        scheduledMs = ms;
        return 1;
      },
      cancel: () => {
        queued.fn = null;
      },
    });

    scheduler.onEvent("notifications");
    scheduler.onEvent("messages");
    assert.equal(reloads.length, 0);
    assert.equal(queued.fn, null);

    hidden = false;
    scheduler.onEvent("notifications");
    scheduler.onEvent("messages");
    assert.equal(scheduledMs, 5_000);
    assert.equal(reloads.length, 0);
    fire();
    assert.deepEqual(reloads, [["messages", "notifications"]]);

    hidden = true;
    scheduler.onEvent("messages");
    scheduler.onEvent("notifications");
    fire();
    assert.equal(reloads.length, 1);

    hidden = false;
    scheduler.onVisible();
    assert.deepEqual(reloads[1], ["messages", "notifications"]);
    scheduler.onVisible();
    assert.equal(reloads.length, 2);
  });

  it("does not reload when a pending timer fires while the tab is hidden", () => {
    const reloads: RealtimeSlice[][] = [];
    let hidden = false;
    const queued: { fn: (() => void) | null } = { fn: null };
    const fire = () => {
      const fn = queued.fn;
      if (fn) fn();
    };
    const scheduler = createRealtimeScheduler({
      debounceMs: REALTIME_DEBOUNCE_MS,
      hidden: () => hidden,
      reload: (slices) => reloads.push([...slices]),
      schedule: (fn) => {
        queued.fn = fn;
        return 7;
      },
      cancel: () => {
        queued.fn = null;
      },
    });

    scheduler.onEvent("notifications");
    hidden = true;
    fire();
    assert.equal(reloads.length, 0);
    hidden = false;
    scheduler.onVisible();
    assert.deepEqual(reloads, [["notifications"]]);
    scheduler.onVisible();
    assert.equal(reloads.length, 1);

    const source = readFileSync(join(process.cwd(), "lib/social/realtime-sync.ts"), "utf8");
    assert.doesNotMatch(source, /\bdeferred\b/);
  });

  it("loads the public catalog once per mount and never from realtime", () => {
    let fetches = 0;
    let loaded = false;
    for (let i = 0; i < 5; i++) {
      if (shouldFetchPublicCatalog({ loaded, source: "mount" })) {
        fetches += 1;
        loaded = true;
      }
    }
    assert.equal(fetches, 1);
    assert.equal(shouldFetchPublicCatalog({ loaded: true, source: "realtime" }), false);
    assert.equal(shouldFetchPublicCatalog({ loaded: true, source: "explicit" }), true);
    assert.equal(shouldFetchPublicCatalog({ loaded: false, source: "realtime" }), false);
  });
});

describe("realtime slice patch", () => {
  it("replaces only the changed rows and keeps the public catalog", () => {
    const publicCards = [{ id: "card-1" }];
    const previous: PostComment = {
      id: "old",
      postId: POST,
      authorId: VIEWER,
      body: "old",
      createdAt: "1",
    };
    const other: PostComment = {
      id: "other",
      postId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      authorId: VIEWER,
      body: "stay",
      createdAt: "1",
    };
    const fresh: PostComment = {
      id: "new",
      postId: POST,
      authorId: VIEWER,
      body: "new",
      createdAt: "2",
    };
    const note = { id: "n1", recipientId: VIEWER } as Notification;
    const older = { id: "n0", recipientId: VIEWER } as Notification;
    const next = applyRealtimePatch(
      {
        notifications: [older],
        messages: [{ id: "m-old" } as DirectMessage],
        comments: [previous, other],
        reposts: [] as PostRepost[],
        publicCards,
      },
      { notifications: [note], messages: [{ id: "m-new" } as DirectMessage], comments: [fresh], postId: POST },
    );
    assert.equal(next.publicCards, publicCards);
    assert.deepEqual(
      next.comments.map((comment) => comment.id),
      ["other", "new"],
    );
    assert.deepEqual(
      next.notifications.map((item) => item.id),
      ["n1", "n0"],
    );
    assert.deepEqual(
      next.messages.map((item) => item.id),
      ["m-new", "m-old"],
    );
  });

  it("fetches the viewer slice once and does not select public_cards", async () => {
    const calls: { table: string; ops: string[] }[] = [];
    const builderFor = (table: string) => {
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
        order() {
          return builder;
        },
        limit(count: number) {
          ops.push(`limit:${count}`);
          return builder;
        },
        not() {
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
          calls.push({ table, ops: [...ops] });
          const data =
            table === "notifications"
              ? [
                  {
                    id: "n1",
                    recipient_id: VIEWER,
                    actor_id: null,
                    kind: "follow",
                    post_id: null,
                    preview: null,
                    href: null,
                    metadata: null,
                    read: false,
                    created_at: "2026-10-21T00:00:00.000Z",
                  },
                ]
              : [
                  {
                    id: "m1",
                    sender_id: VIEWER,
                    receiver_id: "22222222-2222-4222-8222-222222222222",
                    content: "hey",
                    created_at: "2026-10-21T00:00:00.000Z",
                    read: true,
                  },
                ];
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    };
    const supabase = {
      rpc() {
        return Promise.resolve({ data: [], error: null });
      },
      from(table: string) {
        return builderFor(table);
      },
    };

    const patch = await loadRealtimePatch(supabase as unknown as SupabaseClient, new Set(["notifications", "messages"]), {
      viewerId: VIEWER,
      postId: null,
    });
    assert.equal(patch.notifications?.length, 1);
    assert.equal(patch.notifications?.[0]?.recipientId, VIEWER);
    assert.equal(patch.messages?.[0]?.senderId, VIEWER);
    assert.deepEqual(
      calls.map((call) => call.table).sort(),
      ["messages", "notifications"],
    );
    assert.equal(
      calls.find((call) => call.table === "notifications")?.ops.includes(`eq:recipient_id:${VIEWER}`),
      true,
    );
    assert.equal(
      calls.find((call) => call.table === "messages")?.ops.some((op) => op.includes(`sender_id.eq.${VIEWER}`) && op.includes(`receiver_id.eq.${VIEWER}`)),
      true,
    );
    assert.equal(calls.some((call) => call.table === "public_cards"), false);
    assert.equal(
      calls.find((call) => call.table === "notifications")?.ops.includes(`limit:${NOTIFICATION_PAGE_SIZE}`),
      true,
    );
    assert.equal(
      calls.find((call) => call.table === "messages")?.ops.includes(`limit:${MESSAGE_PAGE_SIZE}`),
      true,
    );

    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const listeners = provider.slice(provider.indexOf("const bindings = realtimeBindings"), provider.indexOf("const baseSnapshot"));
    assert.match(listeners, /loadRealtimePatch\(/);
    assert.match(listeners, /document\.hidden/);
    assert.match(listeners, /visibilitychange/);
    assert.doesNotMatch(listeners, /refreshRemote\(|loadSupabaseSocial\(|from\("public_cards"\)/);
    assert.match(provider, /shouldFetchPublicCatalog\(\{ loaded: fullSnapshotRef\.current, source: "mount" \}\)/);
  });
});

describe("auth snapshot reload", () => {
  const other = "22222222-2222-4222-8222-222222222222";

  it("reloads on sign-in only when the user id changes, and always on sign-out", () => {
    assert.deepEqual(authSnapshotReload({ event: "SIGNED_IN", nextUserId: VIEWER, lastUserId: VIEWER }), {
      reload: false,
      lastUserId: VIEWER,
    });
    assert.deepEqual(authSnapshotReload({ event: "SIGNED_IN", nextUserId: other, lastUserId: VIEWER }), {
      reload: true,
      lastUserId: other,
    });
    assert.deepEqual(authSnapshotReload({ event: "SIGNED_IN", nextUserId: VIEWER, lastUserId: null }), {
      reload: true,
      lastUserId: VIEWER,
    });
    assert.deepEqual(authSnapshotReload({ event: "SIGNED_OUT", nextUserId: null, lastUserId: VIEWER }), {
      reload: true,
      lastUserId: null,
    });
    assert.deepEqual(authSnapshotReload({ event: "SIGNED_OUT", nextUserId: null, lastUserId: null }), {
      reload: true,
      lastUserId: null,
    });
    assert.equal(
      authSnapshotReload({ event: "INITIAL_SESSION", nextUserId: VIEWER, lastUserId: null }).reload,
      false,
    );

    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    assert.match(provider, /lastUserIdRef/);
    assert.match(provider, /authSnapshotReload\(/);
    assert.match(provider, /getSession\(\)/);
    assert.match(provider, /event !== "SIGNED_IN" && event !== "SIGNED_OUT"/);
  });
});

describe("paged timeline refs", () => {
  it("stores the latest request in an effect", () => {
    const source = readFileSync(join(process.cwd(), "components/use-paged-timeline.ts"), "utf8");
    assert.match(
      source,
      /useEffect\(\(\) => \{\s*requestRef\.current = input;\s*rememberRef\.current = input\.rememberPosts;\s*\}, \[input\]\);/,
    );
    const withoutEffect = source.replace(
      /useEffect\(\(\) => \{\s*requestRef\.current = input;\s*rememberRef\.current = input\.rememberPosts;\s*\}, \[input\]\);/,
      "",
    );
    assert.doesNotMatch(withoutEffect, /requestRef\.current = input/);
    assert.doesNotMatch(withoutEffect, /rememberRef\.current = input\.rememberPosts/);
  });
});
