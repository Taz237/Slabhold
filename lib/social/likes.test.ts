import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  LIKE_MIGRATION_BATCH,
  applyViewerLikes,
  likeBatches,
  likeIdsToMigrate,
  optimisticLikeCount,
  unionLikes,
} from "./likes";
import type { Post, PostLike } from "./types";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const POST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function like(postId: string, userId: string): PostLike {
  return { postId, userId, createdAt: "2026-10-23T00:00:00.000Z" };
}

function post(id: string, extra: Partial<Post> = {}): Post {
  return {
    id,
    authorId: OTHER,
    body: "",
    imageDataUrl: null,
    quotedPostId: null,
    createdAt: "2026-10-23T00:00:00.000Z",
    ...extra,
    card: extra.card ?? null,
  };
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("like migration helpers", () => {
  it("keeps this account's uuid post ids and batches them by 100", () => {
    const ids = likeIdsToMigrate(
      [
        like(POST_A, ME),
        like(POST_A, ME),
        like("reply-local", ME),
        like(POST_B, OTHER),
        like(POST_B, ME),
      ],
      ME,
    );
    assert.deepEqual(ids, [POST_A, POST_B]);
    const many = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    const batches = likeBatches(many, LIKE_MIGRATION_BATCH);
    assert.equal(batches.length, 3);
    assert.equal(batches[0]?.length, 100);
    assert.equal(batches[1]?.length, 100);
    assert.equal(batches[2]?.length, 50);
  });

  it("unions device likes until the account copy is ready", () => {
    const server = [like(POST_A, ME)];
    const local = [like(POST_A, ME), like(POST_B, ME), like(POST_B, OTHER)];
    assert.deepEqual(
      unionLikes(server, local, ME).map((row) => row.postId),
      [POST_A, POST_B],
    );
    assert.deepEqual(unionLikes(server, local, null).map((row) => row.postId), [POST_A]);
  });

  it("marks viewer likes explicitly only after migration", () => {
    const rows = [post(POST_A), post(POST_B)];
    const open = applyViewerLikes(rows, [like(POST_A, ME)], ME, false);
    assert.equal(open[0]?.viewerLiked, true);
    assert.equal(open[1]?.viewerLiked, undefined);
    const closed = applyViewerLikes(rows, [like(POST_A, ME)], ME, true);
    assert.equal(closed[0]?.viewerLiked, true);
    assert.equal(closed[1]?.viewerLiked, false);
    assert.equal(applyViewerLikes(rows, null, ME, true)[0]?.viewerLiked, undefined);
  });

  it("floors an optimistic unlike at zero", () => {
    assert.equal(optimisticLikeCount(4, true), 5);
    assert.equal(optimisticLikeCount(0, false), 0);
  });
});

describe("like wiring", () => {
  it("rates post likes and leaves reply notices on the old path", () => {
    const action = read("lib/social/like-action.ts");
    const rate = read("lib/comps/rate-limit.ts");
    const provider = read("components/social-provider.tsx");
    assert.match(rate, /const LIKES_BUCKET = "likes"/);
    assert.match(rate, /export const LIKES_LIMIT = 300/);
    assert.match(rate, /export const LIKES_WINDOW_MS = 60 \* 60 \* 1000/);
    assert.match(action, /consumeLikeLimit\(userId\)/);
    assert.match(action, /if \(input\.liked\)/);
    const toggle = provider.slice(provider.indexOf("const toggleLike"), provider.indexOf("const toggleRepost"));
    assert.match(toggle, /syncPostLike\(/);
    assert.match(toggle, /remoteSyncLikeNotification\(/);
    assert.equal(toggle.includes("refreshRemote"), false);
    assert.match(provider, /likes_migrated_v1|likesMigratedFlag\(/);
    assert.match(provider, /migrateStoredLikes\(/);
    assert.match(provider, /after 2026-11-06/);
  });
});
