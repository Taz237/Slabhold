import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupNotifications } from "./group-notifications";
import { groupHeadline } from "./notification-copy";
import { notificationHref } from "./notification-href";
import type { Notification } from "./types";

const note = (id: string, emoji: string, messageId: string): Notification => ({
  id,
  recipientId: "me",
  actorId: "ada",
  kind: "dm_reaction",
  postId: null,
  preview: "Still have the Wemby?",
  metadata: { message_id: messageId, emoji },
  createdAt: "2026-11-16T10:00:00.000Z",
  read: false,
});

describe("DM reaction notices", () => {
  it("reads as Ada reacted ❤️ to your message", () => {
    assert.equal(groupHeadline("dm_reaction", ["Ada"], { emoji: "❤️" }), "Ada reacted ❤️ to your message");
    // A bad or missing emoji still reads well.
    assert.equal(groupHeadline("dm_reaction", ["Ada"], { emoji: "<b>" }), "Ada reacted to your message");
    assert.equal(groupHeadline("dm_reaction", ["Ada"]), "Ada reacted to your message");
  });

  it("keeps each reaction on its own row", () => {
    const groups = groupNotifications([note("n1", "❤️", "m1"), note("n2", "🔥", "m2")]);
    assert.equal(groups.length, 2);
  });

  it("opens the chat with the person who reacted", () => {
    assert.equal(
      notificationHref({ kind: "dm_reaction", postId: null, actorUsername: "adacards" }),
      "/messages/adacards",
    );
    assert.equal(notificationHref({ kind: "dm_reaction", postId: null }), "/messages");
  });
});
