import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dropById,
  followManyLocal,
  insertFirst,
  pendingComment,
  pendingMessage,
  pendingPost,
  replaceId,
  toggleFollowLocal,
  toggleRepostLocal,
  type FollowCountMap,
} from "./optimistic-patch";
import type { FollowEdge, Post, PostComment, PostRepost } from "./types";

const edge = (followerId: string, followingId: string): FollowEdge => ({
  followerId,
  followingId,
  createdAt: "2026-10-01T00:00:00.000Z",
});

describe("optimistic follow counts", () => {
  it("updates edges and counts, then the reverse toggle restores both", () => {
    const follows = [edge("me", "ada")];
    const counts: FollowCountMap = {
      me: { followers: 2, following: 1 },
      ada: { followers: 4, following: 1 },
      sam: { followers: 9, following: 3 },
    };
    const followed = toggleFollowLocal({
      follows,
      counts,
      viewerId: "me",
      targetId: "sam",
      now: "2026-10-23T00:00:00.000Z",
      viewerFollowingCount: 1,
      targetFollowerCount: 9,
    });
    assert.equal(followed.following, true);
    assert.equal(followed.follows.length, 2);
    assert.equal(followed.counts.me.following, 2);
    assert.equal(followed.counts.me.followers, 2);
    assert.equal(followed.counts.sam.followers, 10);
    assert.equal(followed.counts.ada.followers, 4);

    const rolled = toggleFollowLocal({
      follows: followed.follows,
      counts: followed.counts,
      viewerId: "me",
      targetId: "sam",
      now: "2026-10-23T00:00:01.000Z",
      viewerFollowingCount: followed.counts.me.following,
      targetFollowerCount: followed.counts.sam.followers,
    });
    assert.deepEqual(rolled.follows, follows);
    assert.equal(rolled.counts.me.following, 1);
    assert.equal(rolled.counts.sam.followers, 9);
    assert.equal(rolled.following, false);
  });

  it("follow-many only adds missing edges and rolls back by restoring the previous lists", () => {
    const follows = [edge("me", "ada")];
    const counts: FollowCountMap = { me: { followers: 0, following: 1 } };
    const added = followManyLocal({
      follows,
      counts,
      viewerId: "me",
      targetIds: ["ada", "sam", "me"],
      now: "2026-10-23T00:00:00.000Z",
      viewerFollowingCount: 1,
    });
    assert.deepEqual(
      added.follows.map((item) => item.followingId),
      ["ada", "sam"],
    );
    assert.equal(added.counts.me.following, 2);
    assert.equal(added.counts.sam.followers, 1);
    assert.deepEqual(follows, [edge("me", "ada")]);
    assert.equal(counts.me.following, 1);
  });
});

describe("optimistic post, reply, message, and repost", () => {
  it("inserts a pending row and drop restores the previous list", () => {
    const posts: Post[] = [
      {
        id: "kept",
        authorId: "me",
        body: "old",
        imageDataUrl: null,
        card: null,
        quotedPostId: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ];
    const pending = pendingPost({
      id: "tmp",
      authorId: "me",
      body: "new",
      imageDataUrl: null,
      card: null,
      quotedPostId: null,
      createdAt: "2026-10-23T00:00:00.000Z",
    });
    const next = insertFirst(posts, pending);
    assert.equal(next[0]?.pending, true);
    assert.deepEqual(dropById(next, "tmp"), posts);
    assert.equal(replaceId(next, "tmp", "real")[0]?.id, "real");
    assert.equal(replaceId(next, "tmp", "real")[0]?.pending, false);
  });

  it("rolls a reply and a message back by id", () => {
    const comments: PostComment[] = [];
    const comment = pendingComment({
      id: "tmp-c",
      postId: "p1",
      authorId: "me",
      body: "nice",
      createdAt: "2026-10-23T00:00:00.000Z",
    });
    assert.deepEqual(dropById(insertFirst(comments, comment), "tmp-c"), comments);

    const messages = [
      pendingMessage({
        id: "tmp-m",
        senderId: "me",
        receiverId: "sam",
        content: "hey",
        createdAt: "2026-10-23T00:00:00.000Z",
      }),
    ];
    assert.deepEqual(dropById(messages, "tmp-m"), []);
  });

  it("toggles a repost off again without a reload", () => {
    const reposts: PostRepost[] = [];
    const on = toggleRepostLocal(reposts, "p1", "me", "2026-10-23T00:00:00.000Z");
    assert.equal(on.length, 1);
    const off = toggleRepostLocal(on, "p1", "me", "2026-10-23T00:00:01.000Z");
    assert.deepEqual(off, reposts);
  });
});
