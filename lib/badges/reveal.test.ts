import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { revealFor } from "./reveal";
import type { BadgeCounts } from "./progress";

const counts: BadgeCounts = {
  collector: 52,
  streak: 4,
  streakCurrent: 3,
  "rainbow-chaser": 0,
  "slab-king": 5,
  "voice-of-the-hobby": 0,
  following: 0,
  leaderboard: 0,
};

describe("earn reveal", () => {
  it("leads with the highest unseen badge and lists the rest", () => {
    const reveal = revealFor(
      [
        { id: "1", category: "slab-king", tier: "bronze" },
        { id: "2", category: "collector", tier: "gold" },
        { id: "3", category: "collector", tier: "silver" },
        { id: "4", category: "streak", tier: "silver" },
      ],
      counts,
    );
    assert.ok(reveal);
    assert.equal(reveal.headline.category, "collector");
    assert.equal(reveal.headline.tier, "gold");
    assert.equal(reveal.title, "Gold Collector unlocked");
    assert.equal(reveal.next, "52 / 100 cards to Platinum");
    assert.deepEqual(
      reveal.others.map((badge) => `${badge.category}:${badge.tier}`),
      ["collector:silver", "streak:silver", "slab-king:bronze"],
    );
    assert.deepEqual(reveal.ids.sort(), ["1", "2", "3", "4"]);
  });

  it("shows the live streak toward the next tier", () => {
    const reveal = revealFor([{ id: "9", category: "streak", tier: "silver" }], counts);
    assert.equal(reveal?.next, "3 / 8 weeks to Gold");
  });

  it("returns null with nothing unseen", () => {
    assert.equal(revealFor([], counts), null);
  });
});
