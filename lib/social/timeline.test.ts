import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Post, Profile } from "./types";
import { followingTimeline } from "./timeline";

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

describe("following timeline", () => {
  it("keeps ordinary posts that mention a want list", () => {
    const first = post({
      id: "a",
      createdAt: "2026-10-01T00:00:00.000Z",
      body: "Added 2020 Prizm Jordan Love #47 to my want list",
    });
    const second = post({
      id: "b",
      createdAt: "2026-10-02T00:00:00.000Z",
      body: "Added the same line again to my want list",
    });
    const feed = followingTimeline([first, second], [], [me], [], "me");
    assert.deepEqual(
      feed.map((item) => item.post.id),
      ["b", "a"],
    );
  });
});
