import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupHeadline, groupNotifications } from "./group-notifications";
import type { Notification } from "./types";

function note(partial: Partial<Notification> & Pick<Notification, "id">): Notification {
  return {
    recipientId: "me",
    actorId: "actor",
    kind: "like",
    postId: "post-1",
    preview: "Nice card",
    href: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    read: false,
    ...partial,
  };
}

describe("grouped notifications", () => {
  it("reads as DonnieTaz and 4 others liked your post", () => {
    const names = ["DonnieTaz", "Jordan", "Sam", "Maya", "Alex"];
    assert.equal(groupHeadline("like", names), "DonnieTaz and 4 others liked your post");
  });

  it("names both people when only two liked the post", () => {
    assert.equal(
      groupHeadline("like", ["DonnieTaz", "Jordan"]),
      "DonnieTaz and Jordan liked your post",
    );
  });

  it("groups likes on the same post and keeps other posts separate", () => {
    const groups = groupNotifications([
      note({ id: "n5", actorId: "a5", createdAt: "2026-10-05T00:00:00.000Z" }),
      note({ id: "n4", actorId: "a4", createdAt: "2026-10-04T00:00:00.000Z" }),
      note({
        id: "other",
        kind: "like",
        postId: "post-2",
        actorId: "a9",
        createdAt: "2026-10-03T00:00:00.000Z",
      }),
      note({ id: "n3", actorId: "a3", createdAt: "2026-10-03T00:00:00.000Z" }),
      note({ id: "n2", actorId: "a2", createdAt: "2026-10-02T00:00:00.000Z" }),
      note({ id: "n1", actorId: "a1", createdAt: "2026-10-01T00:00:00.000Z" }),
    ]);
    const main = groups.find((group) => group.postId === "post-1");
    assert.ok(main);
    assert.equal(main.notes.length, 5);
    assert.deepEqual(main.actorIds, ["a5", "a4", "a3", "a2", "a1"]);
    assert.equal(groups.length, 2);
  });

  it("counts a repeat actor once", () => {
    const groups = groupNotifications([
      note({ id: "c2", kind: "comment", actorId: "a1", createdAt: "2026-10-02T00:00:00.000Z", preview: "Second" }),
      note({ id: "c1", kind: "comment", actorId: "a1", createdAt: "2026-10-01T00:00:00.000Z", preview: "First" }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0]?.actorIds, ["a1"]);
    assert.equal(groups[0]?.preview, "Second");
    assert.equal(groupHeadline("comment", ["DonnieTaz"]), "DonnieTaz commented on your post");
  });

  it("groups follows and leaves each want alert on its own row", () => {
    const groups = groupNotifications([
      note({ id: "f2", kind: "follow", postId: null, actorId: "b", createdAt: "2026-10-02T00:00:00.000Z", preview: null }),
      note({
        id: "w2",
        kind: "want_alert",
        actorId: null,
        postId: null,
        preview: "Jordan Love sold for $40",
        href: "/cards/1",
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
      note({ id: "f1", kind: "follow", postId: null, actorId: "a", createdAt: "2026-10-01T00:00:00.000Z", preview: null }),
      note({
        id: "w1",
        kind: "want_alert",
        actorId: null,
        postId: null,
        preview: "Jordan Love sold for $30",
        href: "/cards/1",
        createdAt: "2026-10-01T00:00:00.000Z",
      }),
    ]);
    const follows = groups.filter((group) => group.kind === "follow");
    const wants = groups.filter((group) => group.kind === "want_alert");
    assert.equal(follows.length, 1);
    assert.equal(follows[0]?.notes.length, 2);
    assert.equal(wants.length, 2);
  });
});
