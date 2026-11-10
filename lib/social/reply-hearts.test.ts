import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { loadActivity, saveActivity, emptyActivity } from "./activity";
import {
  loadViewerReplyLikes,
  replyLikeTap,
  viewerLikes,
  withDeviceLike,
  type ReplyLikeState,
} from "./likes";
import type { PostLike } from "./types";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const POST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REPLY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REPLY_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function like(postId: string, userId = ME): PostLike {
  return { postId, userId, createdAt: "2026-11-01T00:00:00.000Z" };
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** What the provider builds once post likes are on the account. */
function migratedSnapshot(server: PostLike[], device: PostLike[], replies: ReplyLikeState | null = null) {
  return viewerLikes({
    server,
    device,
    userId: ME,
    serverReady: true,
    postIds: new Set([POST_A, POST_B]),
    replies,
  });
}

const store = new Map<string, string>();
let hadWindow = false;

before(() => {
  hadWindow = "window" in globalThis;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    },
  });
});

after(() => {
  if (!hadWindow) delete (globalThis as { window?: unknown }).window;
});

describe("reply hearts after post likes migrate", () => {
  it("keeps a device reply heart in the snapshot", () => {
    const likes = migratedSnapshot([like(POST_A)], [like(POST_A), like(REPLY)]);
    assert.deepEqual(likes.map((row) => row.postId).sort(), [POST_A, REPLY].sort());
  });

  it("survives a remount: the heart comes back from the device copy", () => {
    store.clear();
    saveActivity(emptyActivity);
    // Tap the reply heart.
    const before = migratedSnapshot([like(POST_A)], loadActivity().likes);
    const tap = replyLikeTap(before, REPLY, ME);
    assert.deepEqual(tap, { wasLiked: false, liked: true });
    const stored = loadActivity();
    saveActivity({ ...stored, likes: withDeviceLike(stored.likes, REPLY, ME, tap.liked) });

    // Navigate away and back: a fresh snapshot from storage and the server.
    const remounted = migratedSnapshot([like(POST_A)], loadActivity().likes);
    assert.ok(remounted.some((row) => row.postId === REPLY && row.userId === ME));
  });

  it("makes the second tap an unlike, and the unlike is what is sent", () => {
    const liked = migratedSnapshot([like(POST_A)], [like(REPLY)]);
    const second = replyLikeTap(liked, REPLY, ME);
    assert.deepEqual(second, { wasLiked: true, liked: false });
    const device = withDeviceLike([like(REPLY), like(REPLY, OTHER)], REPLY, ME, second.liked);
    assert.deepEqual(device, [like(REPLY, OTHER)], "only this account's heart clears");
    const after = migratedSnapshot([like(POST_A)], device);
    assert.equal(after.some((row) => row.postId === REPLY && row.userId === ME), false);
    assert.deepEqual(replyLikeTap(after, REPLY, ME), { wasLiked: false, liked: true });
  });

  it("leaves post likes to the server once migrated", () => {
    // POST_B was unliked on the account; an old device copy must not bring it back.
    const likes = migratedSnapshot([like(POST_A)], [like(POST_A), like(POST_B)]);
    assert.deepEqual(likes.map((row) => row.postId), [POST_A]);
  });

  it("matches the old union before migration", () => {
    const likes = viewerLikes({
      server: [like(POST_A)],
      device: [like(POST_B), like(REPLY), like(REPLY, OTHER)],
      userId: ME,
      serverReady: false,
      postIds: new Set([POST_A, POST_B]),
    });
    assert.deepEqual(likes.map((row) => row.postId), [POST_A, POST_B, REPLY]);
  });

  it("follows the comment_likes answer for a reply once the table is read", () => {
    const replies: ReplyLikeState = {
      userId: ME,
      known: new Map([
        [REPLY, false],
        [REPLY_2, true],
      ]),
      missing: false,
    };
    const likes = migratedSnapshot([like(POST_A)], [like(REPLY)], replies);
    assert.deepEqual(likes.map((row) => row.postId).sort(), [POST_A, REPLY_2].sort());
    const otherViewer = migratedSnapshot([like(POST_A)], [like(REPLY)], { ...replies, userId: OTHER });
    assert.ok(otherViewer.some((row) => row.postId === REPLY), "another account's read is ignored");
  });
});

describe("comment_likes read", () => {
  function client(result: { data: unknown; error: { code?: string; message: string } | null }) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => Promise.resolve(result),
    };
    return { from: () => chain } as never;
  }

  it("is null when the table is not installed yet", async () => {
    const missing = client({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.comment_likes' in the schema cache" },
    });
    assert.equal(await loadViewerReplyLikes(missing, ME, [REPLY]), null);
  });

  it("returns the liked reply ids", async () => {
    const found = client({ data: [{ comment_id: REPLY }], error: null });
    assert.deepEqual([...((await loadViewerReplyLikes(found, ME, [REPLY, REPLY_2])) ?? [])], [REPLY]);
  });
});

describe("reply heart wiring", () => {
  const provider = read("components/social-provider.tsx");
  const toggle = provider.slice(provider.indexOf("const toggleLike"), provider.indexOf("const toggleRepost"));
  const reply = toggle.slice(toggle.indexOf("if (!knownPost)"), toggle.indexOf("const wasLiked =\n"));

  it("sends the tap's own state, so a second tap is an unlike", () => {
    assert.match(reply, /replyLikeTap\(current\.likes, postId, userId\)/);
    assert.match(reply, /syncReplyLike\(\{ commentId: postId, liked: nextLiked \}\)/);
    assert.match(reply, /remoteSyncLikeNotification\([\s\S]*liked: nextLiked/);
    assert.match(reply, /withDeviceLike\(/);
    assert.equal(reply.includes("localToggleLike"), false, "the device heart is set, not flipped");
  });

  it("keeps post likes on syncPostLike", () => {
    const post = toggle.slice(toggle.indexOf("const wasLiked =\n"));
    assert.match(post, /syncPostLike\(\{ postId, liked: nextLiked \}\)/);
    assert.equal(post.includes("syncReplyLike"), false);
  });

  it("builds snapshot likes with viewerLikes, even after migration", () => {
    assert.match(provider, /likes: viewerLikes\(\{/);
    assert.match(provider, /device: activity\.likes/);
  });

  it("writes reply likes to comment_likes, never to likes", () => {
    const action = read("lib/social/like-action.ts");
    const replyAction = action.slice(action.indexOf("export async function syncReplyLike"));
    assert.match(replyAction, /from\("comment_likes"\)/);
    assert.equal(replyAction.includes('from("likes")'), false);
    assert.match(replyAction, /missingLikesRelation/);
    assert.match(replyAction, /fallback: true/);
  });

  it("keeps the comment_likes file in sync with what prod applied", () => {
    const sql = read("supabase/migrations/20261110120000_comment_likes.sql");
    assert.ok(
      sql.startsWith(
        "-- ALREADY APPLIED to prod on 2026-11-10 (recorded as migration 20261110112746 comment_likes).\n",
      ),
    );
    assert.match(sql, /QA Guard/);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /join public\.posts p on p\.id = c\.post_id/);
    assert.match(sql, /references public\.comments \(id\) on delete cascade/);
    assert.match(sql, /enable row level security/);
    assert.equal(/insert into public\.likes/i.test(sql), false);
  });
});
