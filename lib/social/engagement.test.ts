import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { engagementKeys, mergeEngagement, postIdsFromKeys } from "./engagement";
import type { PostComment, PostRepost } from "./types";

function comment(id: string, postId: string): PostComment {
  return { id, postId, authorId: "a", body: id, createdAt: `2026-10-30T00:00:0${id.length}.000Z` };
}

function repost(postId: string, userId: string): PostRepost {
  return { postId, userId, createdAt: "2026-10-30T00:00:00.000Z" };
}

describe("replies and reposts for posts loaded later", () => {
  it("keys each post once, and reads back the post ids", () => {
    const keys = engagementKeys(["b", "a", "a", ""]);
    assert.deepEqual(keys, ["post:a", "post:b"]);
    assert.deepEqual(postIdsFromKeys(keys), ["a", "b"]);
  });

  it("replaces those posts' replies and reposts with the fresh read, and leaves others", () => {
    const existing = {
      comments: [comment("old", "p1"), comment("keep", "p2")],
      reposts: [repost("p1", "gone"), repost("p2", "stays")],
    };
    const next = mergeEngagement(existing, ["p1"], {
      comments: [comment("new", "p1")],
      reposts: [repost("p1", "fresh")],
    });
    assert.deepEqual(next.comments.map((item) => item.id).sort(), ["keep", "new"]);
    assert.deepEqual(next.reposts.map((item) => `${item.postId}:${item.userId}`).sort(), ["p1:fresh", "p2:stays"]);
  });

  it("keeps a reply the viewer is still sending", () => {
    const sending = { ...comment("pending-1", "p1"), id: "pending-1" };
    const next = mergeEngagement({ comments: [sending], reposts: [] }, ["p1"], { comments: [], reposts: [] }, (id) =>
      id.startsWith("pending-"),
    );
    assert.deepEqual(next.comments.map((item) => item.id), ["pending-1"]);
  });
});
