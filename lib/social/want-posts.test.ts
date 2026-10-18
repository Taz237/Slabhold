import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Post, Profile } from "./types";
import { followingTimeline } from "./timeline";
import {
  collapseWantListPosts,
  hasWantListPost,
  shouldPublishWantPost,
  wantListPostBody,
} from "./want-posts";

function card(id: string) {
  return {
    id,
    playerName: "Jordan Love",
    year: 2020,
    setBrand: "Prizm",
    cardNumber: "47",
    sport: "Football",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 40,
  };
}

function post(partial: Partial<Post> & Pick<Post, "id" | "createdAt">): Post {
  return {
    authorId: "me",
    body: wantListPostBody("2020 Prizm Jordan Love #47"),
    imageDataUrl: null,
    card: card("card-1"),
    quotedPostId: null,
    ...partial,
  };
}

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

describe("want-list posts in the feed", () => {
  it("publishes a public card once and skips a private card", () => {
    assert.equal(shouldPublishWantPost({ isPublic: true, alreadyPosted: false }), true);
    assert.equal(shouldPublishWantPost({ isPublic: true, alreadyPosted: true }), false);
    assert.equal(shouldPublishWantPost({ isPublic: false, alreadyPosted: false }), false);
  });

  it("keeps one want-list post per card in the following feed", () => {
    const older = post({ id: "old", createdAt: "2026-10-01T00:00:00.000Z" });
    const newer = post({ id: "new", createdAt: "2026-10-02T00:00:00.000Z" });
    const other = post({
      id: "other-card",
      createdAt: "2026-10-03T00:00:00.000Z",
      card: card("card-2"),
      body: wantListPostBody("2018 Prizm Luka #1"),
    });
    const chat = post({
      id: "chat",
      createdAt: "2026-10-04T00:00:00.000Z",
      body: "Just a normal post",
      card: null,
    });

    const collapsed = collapseWantListPosts([older, newer, other, chat]);
    const wantIds = collapsed.filter((item) => item.card?.id === "card-1").map((item) => item.id);
    assert.deepEqual(wantIds, ["new"]);

    const feed = followingTimeline([older, newer, other, chat], [], [me], [], "me");
    const shown = feed.filter((item) => item.post.card?.id === "card-1");
    assert.equal(shown.length, 1);
    assert.equal(shown[0]?.post.id, "new");
    assert.equal(feed.length, 3);
  });

  it("treats an existing announcement as already posted", () => {
    const posts = [post({ id: "new", createdAt: "2026-10-02T00:00:00.000Z" })];
    assert.equal(hasWantListPost(posts, "me", "card-1"), true);
    assert.equal(hasWantListPost(posts, "me", "card-2"), false);
  });
});
