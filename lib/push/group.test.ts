import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BATCH_WINDOW_MS, batchDecision, distinctValidActors, dmSummaryLine, pushGroupKey, summaryLine } from "./group";
import { RECIPIENT_PER_HOUR, RECIPIENT_PER_MINUTE, consumeFlushLimit, consumeTestLimit, recipientAllows } from "./rate";

describe("push grouping", () => {
  it("keys each kind like X", () => {
    assert.equal(pushGroupKey("like", "p1", "a1"), "like:p1");
    assert.equal(pushGroupKey("repost", "p1", "a1"), "repost:p1");
    assert.equal(pushGroupKey("follow", null, "a1"), "follow");
    assert.equal(pushGroupKey("comment", "p1", "a1"), "reply:p1");
    assert.equal(pushGroupKey("mention", "p1", "a1"), "mention:p1");
    assert.equal(pushGroupKey("quote", "q9", "a1"), "quote:q9");
    assert.equal(pushGroupKey("dm", null, "a1"), "dm:a1");
  });

  it("sends the first event and collapses the rest of the minute", () => {
    const now = 1_000_000;
    assert.equal(batchDecision({ now, lastPushAt: null, leaseTaken: true, rateAllows: true }), "send");
    assert.equal(batchDecision({ now, lastPushAt: now - 1_000, leaseTaken: true, rateAllows: true }), "collapse");
    assert.equal(batchDecision({ now, lastPushAt: now - BATCH_WINDOW_MS + 1, leaseTaken: true, rateAllows: true }), "collapse");
    assert.equal(batchDecision({ now, lastPushAt: now - BATCH_WINDOW_MS, leaseTaken: true, rateAllows: true }), "send");
    assert.equal(batchDecision({ now, lastPushAt: null, leaseTaken: false, rateAllows: true }), "collapse");
    assert.equal(batchDecision({ now, lastPushAt: null, leaseTaken: true, rateAllows: false }), "collapse");
  });

  it("counts distinct actors that are still valid, newest first", () => {
    const rows = [
      { actorId: "a", createdAt: "2026-10-30T12:00:01Z", valid: true },
      { actorId: "b", createdAt: "2026-10-30T12:00:05Z", valid: false }, // unliked
      { actorId: "c", createdAt: "2026-10-30T12:00:09Z", valid: true },
      { actorId: "a", createdAt: "2026-10-30T12:00:10Z", valid: true },
      { actorId: null, createdAt: "2026-10-30T12:00:11Z", valid: true },
    ];
    assert.deepEqual(distinctValidActors(rows), ["a", "c"]);
  });

  it("words 1, 2 and N actors with the in-app verbs", () => {
    assert.equal(summaryLine("like", ["Jordan Hale"], 1), "Jordan Hale liked your post");
    assert.equal(summaryLine("like", ["Jordan Hale", "Maya Chen"], 2), "Jordan Hale and Maya Chen liked your post");
    assert.equal(summaryLine("like", ["Jordan Hale", "Maya Chen"], 5), "Jordan Hale and 4 others liked your post");
    assert.equal(summaryLine("follow", ["Maya Chen"], 3), "Maya Chen and 2 others followed you");
    assert.equal(summaryLine("comment", ["Maya Chen"], 2), "Maya Chen and Someone commented on your post");
    assert.equal(summaryLine("repost", ["A", "B"], 3), "A and 2 others reposted your post");
  });

  it("words the DM count", () => {
    assert.equal(dmSummaryLine(3, "Jordan Hale"), "3 new messages from Jordan Hale");
    assert.equal(dmSummaryLine(1, "Jordan Hale"), "1 new message from Jordan Hale");
  });
});

describe("push rate limits", () => {
  it("allows 6 a minute and 60 an hour per recipient", () => {
    assert.equal(recipientAllows({ lastMinute: 0, lastHour: 0 }), true);
    assert.equal(recipientAllows({ lastMinute: RECIPIENT_PER_MINUTE - 1, lastHour: 10 }), true);
    assert.equal(recipientAllows({ lastMinute: RECIPIENT_PER_MINUTE, lastHour: 10 }), false);
    assert.equal(recipientAllows({ lastMinute: 0, lastHour: RECIPIENT_PER_HOUR - 1 }), true);
    assert.equal(recipientAllows({ lastMinute: 0, lastHour: RECIPIENT_PER_HOUR }), false);
  });

  it("limits each caller: 30 flushes and 1 test a minute", async () => {
    const counts = new Map<string, number>();
    const consume = async (userId: string, bucket: string, windowMs: number, limit: number) => {
      assert.equal(windowMs, 60_000);
      const key = `${userId}:${bucket}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next <= limit;
    };
    const flushes = [];
    for (let i = 0; i < 31; i++) flushes.push(await consumeFlushLimit(consume, "u1"));
    assert.equal(flushes.filter(Boolean).length, 30);
    assert.equal(flushes[30], false);
    assert.equal(await consumeFlushLimit(consume, "u2"), true);
    assert.equal(await consumeTestLimit(consume, "u1"), true);
    assert.equal(await consumeTestLimit(consume, "u1"), false);
  });
});
