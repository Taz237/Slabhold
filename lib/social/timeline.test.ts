import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { FollowEdge, Post, PostRepost, Profile } from "./types";
import { followedAccountIds, followingTimeline } from "./timeline";

const me: Profile = {
  id: "me",
  email: "",
  username: "me",
  displayName: "Me",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function post(partial: Partial<Post> & Pick<Post, "id" | "body" | "createdAt">): Post {
  return {
    authorId: "me",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    ...partial,
  };
}

const joy: Profile = { ...me, id: "joy", username: "joy", displayName: "Joy" };
const sam: Profile = { ...me, id: "sam", username: "sam", displayName: "Sam" };

function edge(followerId: string, followingId: string): FollowEdge {
  return { followerId, followingId, createdAt: "2026-10-01T00:00:00.000Z" };
}

describe("following timeline", () => {
  it("keeps ordinary posts that mention a want list", () => {
    const first = post({
      id: "a",
      authorId: "joy",
      createdAt: "2026-10-01T00:00:00.000Z",
      body: "Added 2020 Prizm Jordan Love #47 to my want list",
    });
    const second = post({
      id: "b",
      authorId: "joy",
      createdAt: "2026-10-02T00:00:00.000Z",
      body: "Added the same line again to my want list",
    });
    const feed = followingTimeline([first, second], [], [me, joy], [edge("me", "joy")], "me");
    assert.deepEqual(
      feed.map((item) => item.post.id),
      ["b", "a"],
    );
  });

  it("shows only posts and reposts from accounts the viewer follows", () => {
    const followed = post({
      id: "followed",
      authorId: "joy",
      createdAt: "2026-10-03T00:00:00.000Z",
      body: "From someone I follow",
    });
    const stranger = post({
      id: "stranger",
      authorId: "sam",
      createdAt: "2026-10-04T00:00:00.000Z",
      body: "From someone I do not follow",
    });
    const mine = post({
      id: "mine",
      authorId: "me",
      createdAt: "2026-10-05T00:00:00.000Z",
      body: "My own post",
    });
    const reposted = post({
      id: "reposted",
      authorId: "sam",
      createdAt: "2026-10-01T00:00:00.000Z",
      body: "Reposted by someone I follow",
    });
    const reposts: PostRepost[] = [
      { postId: "reposted", userId: "joy", createdAt: "2026-10-06T00:00:00.000Z" },
      { postId: "followed", userId: "sam", createdAt: "2026-10-07T00:00:00.000Z" },
      { postId: "stranger", userId: "me", createdAt: "2026-10-08T00:00:00.000Z" },
    ];
    const follows = [edge("me", "joy"), edge("sam", "me")];
    assert.deepEqual([...followedAccountIds(follows, "me")], ["joy"]);
    const feed = followingTimeline(
      [followed, stranger, mine, reposted],
      reposts,
      [me, joy, sam],
      follows,
      "me",
    );
    assert.deepEqual(
      feed.map((item) => item.post.id),
      ["stranger", "reposted", "mine", "followed"],
    );
    assert.equal(feed[0]?.repostedBy?.id, "me");
    assert.equal(feed[1]?.repostedBy?.id, "joy");
    assert.equal(feed[2]?.repostedBy, null);
    assert.equal(feed[3]?.repostedBy, null);
  });

  it("puts the viewer's own new post at the top when they follow one account", () => {
    const theirs = post({
      id: "theirs",
      authorId: "joy",
      createdAt: "2026-10-03T00:00:00.000Z",
      body: "From someone I follow",
    });
    const mine = post({
      id: "mine",
      authorId: "me",
      createdAt: "2026-10-09T00:00:00.000Z",
      body: "Just posted",
    });
    const feed = followingTimeline([theirs, mine], [], [me, joy], [edge("me", "joy")], "me");
    assert.deepEqual(
      feed.map((item) => item.post.id),
      ["mine", "theirs"],
    );
    assert.equal(feed[0]?.repostedBy, null);
  });

  it("is empty when the viewer follows nobody", () => {
    const mine = post({
      id: "mine",
      createdAt: "2026-10-02T00:00:00.000Z",
      body: "Only me",
    });
    const other = post({
      id: "other",
      authorId: "joy",
      createdAt: "2026-10-03T00:00:00.000Z",
      body: "Someone else",
    });
    assert.equal(followedAccountIds([], "me").size, 0);
    assert.deepEqual(followingTimeline([mine, other], [], [me, joy], [], "me"), []);
  });
});

describe("following tab", () => {
  it("uses the followed feed and the empty-state copy", () => {
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    assert.match(feed, /lane === "following" \? feed : everyone/);
    assert.match(feed, /<FollowingEmpty profiles=\{suggestionRail\} \/>/);
    const empty = readFileSync(join(process.cwd(), "components/collector-suggestions.tsx"), "utf8");
    assert.match(empty, /Your Following feed is quiet/);
    assert.match(empty, /id="collectors-to-follow"/);
  });
});
