import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupNotifications } from "./group-notifications";
import { groupHref, notificationHref } from "./notification-href";
import type { Notification, Profile } from "./types";

const POST = "6f9a1c3e-1111-4222-8333-944455556666";

function note(partial: Partial<Notification>): Notification {
  return {
    id: "n1",
    recipientId: "me",
    actorId: "a1",
    kind: "like",
    postId: POST,
    preview: null,
    href: null,
    createdAt: "2026-10-30T12:00:00.000Z",
    read: false,
    ...partial,
  };
}

const jordan = { id: "a1", username: "jordanhale", displayName: "Jordan Hale" } as Profile;

describe("notification links", () => {
  it("opens the profile for a follow, the post for post notices, and the chat for a DM", () => {
    assert.equal(notificationHref({ kind: "follow", postId: null, actorUsername: "jordanhale" }), "/u/jordanhale");
    for (const kind of ["like", "repost", "comment", "mention", "quote"] as const) {
      assert.equal(notificationHref({ kind, postId: POST }), `/posts/${POST}`);
    }
    assert.equal(notificationHref({ kind: "dm", postId: null, actorUsername: "@jordanhale" }), "/messages/jordanhale");
  });

  it("falls back when the actor or post is gone", () => {
    assert.equal(notificationHref({ kind: "follow", postId: null }), "/profile");
    assert.equal(notificationHref({ kind: "like", postId: null }), "/");
    assert.equal(notificationHref({ kind: "dm", postId: null }), "/messages");
  });

  it("keeps want alerts and deal notices on their stored links", () => {
    assert.equal(notificationHref({ kind: "want_alert", postId: null, storedHref: "/cards/x" }), "/cards/x");
    assert.equal(
      notificationHref({ kind: "deal_confirm", postId: null, actorId: "a1", actorUsername: "jordanhale" }),
      "/messages/jordanhale",
    );
  });

  it("builds a grouped row's link from its newest notice", () => {
    const [group] = groupNotifications([note({ kind: "follow", postId: null })]);
    assert.equal(groupHref(group!, new Map([["a1", jordan]])), "/u/jordanhale");
    const [likes] = groupNotifications([note({})]);
    assert.equal(groupHref(likes!, new Map()), `/posts/${POST}`);
  });
});
