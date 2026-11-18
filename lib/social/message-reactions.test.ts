import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REACTION_EMOJIS,
  applyReaction,
  isReactionEmoji,
  mapReactionRow,
  nextReaction,
  reactionPill,
  reactionsFor,
  tapGesture,
  DOUBLE_TAP_MS,
  type MessageReaction,
} from "./message-reactions";

const r = (messageId: string, userId: string, emoji: string, at = "2026-11-16T10:00:00.000Z"): MessageReaction => ({
  messageId,
  userId,
  emoji: emoji as MessageReaction["emoji"],
  createdAt: at,
});

describe("message reactions", () => {
  it("offers the six emoji in Instagram order, and nothing else", () => {
    assert.deepEqual([...REACTION_EMOJIS], ["❤️", "👍", "😂", "😮", "😢", "🔥"]);
    assert.equal(isReactionEmoji("🔥"), true);
    assert.equal(isReactionEmoji("💩"), false);
    assert.equal(isReactionEmoji(null), false);
  });

  it("adds, removes on the same emoji, and swaps on a different one", () => {
    assert.deepEqual(nextReaction(null, "❤️"), "❤️");
    assert.deepEqual(nextReaction("❤️", "❤️"), null);
    assert.deepEqual(nextReaction("❤️", "🔥"), "🔥");
  });

  it("keeps one reaction per person per message", () => {
    let list: MessageReaction[] = [r("m1", "ada", "😂")];
    list = applyReaction(list, { messageId: "m1", userId: "me", emoji: "❤️", at: "t1" });
    assert.equal(reactionsFor(list, "m1").length, 2);
    list = applyReaction(list, { messageId: "m1", userId: "me", emoji: "🔥", at: "t2" });
    assert.deepEqual(
      reactionsFor(list, "m1").map((item) => `${item.userId}:${item.emoji}`),
      ["ada:😂", "me:🔥"],
    );
    list = applyReaction(list, { messageId: "m1", userId: "me", emoji: null, at: "t3" });
    assert.deepEqual(reactionsFor(list, "m1").map((item) => item.userId), ["ada"]);
    // Other messages are untouched.
    list = applyReaction([...list, r("m2", "me", "👍")], { messageId: "m1", userId: "me", emoji: "😮", at: "t4" });
    assert.equal(reactionsFor(list, "m2")[0]?.emoji, "👍");
  });

  it("draws the pill: the emoji, a count only when both people reacted", () => {
    assert.equal(reactionPill([], "me"), null);
    assert.deepEqual(reactionPill([r("m1", "ada", "❤️")], "me"), {
      emojis: ["❤️"],
      count: null,
      mine: null,
    });
    // Same emoji twice shows once, with a 2.
    assert.deepEqual(reactionPill([r("m1", "ada", "❤️"), r("m1", "me", "❤️", "2026-11-16T10:01:00.000Z")], "me"), {
      emojis: ["❤️"],
      count: 2,
      mine: "❤️",
    });
    // Different emoji: both, oldest first, and a 2.
    assert.deepEqual(reactionPill([r("m1", "me", "🔥", "2026-11-16T10:05:00.000Z"), r("m1", "ada", "😂")], "me"), {
      emojis: ["😂", "🔥"],
      count: 2,
      mine: "🔥",
    });
  });

  it("reads only good rows from the database", () => {
    assert.deepEqual(
      mapReactionRow({ message_id: "m1", user_id: "ada", emoji: "😢", created_at: "2026-11-16T10:00:00.000Z" }),
      r("m1", "ada", "😢"),
    );
    assert.equal(mapReactionRow({ message_id: "m1", user_id: "ada", emoji: "💩", created_at: "x" }), null);
    assert.equal(mapReactionRow({ message_id: null, user_id: "ada", emoji: "❤️" }), null);
  });

  it("tells a double tap from a single tap", () => {
    // First tap waits to see whether a second one follows.
    assert.deepEqual(tapGesture(null, 1_000), { kind: "wait", at: 1_000 });
    // A second tap in time is a double tap.
    assert.deepEqual(tapGesture(1_000, 1_000 + DOUBLE_TAP_MS - 1), { kind: "double" });
    // Too slow: a fresh first tap.
    assert.deepEqual(tapGesture(1_000, 1_000 + DOUBLE_TAP_MS + 1), { kind: "wait", at: 1_000 + DOUBLE_TAP_MS + 1 });
  });
});
