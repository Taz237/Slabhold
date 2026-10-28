import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeShareView, earnedOnLabel } from "./share";

const profile = {
  username: "democollector",
  displayName: "Demo Collector",
  avatarUrl: null,
  showBadges: true,
};

const earned = [
  { category: "collector", tier: "bronze", earnedAt: "2026-10-01T15:00:00Z" },
  { category: "collector", tier: "gold", earnedAt: "2026-10-20T15:00:00Z" },
];

describe("badge share page", () => {
  it("shows an earned badge", () => {
    const view = badgeShareView({ profile, earned, category: "collector", tier: "gold" });
    assert.ok(view);
    assert.equal(view.name, "Gold Collector");
    assert.equal(view.tierLabel, "GOLD · COLLECTOR");
    assert.equal(view.username, "democollector");
    assert.equal(view.earnedAt, "2026-10-20T15:00:00Z");
  });

  it("404s when the badge is not earned", () => {
    assert.equal(badgeShareView({ profile, earned, category: "collector", tier: "platinum" }), null);
    assert.equal(badgeShareView({ profile, earned, category: "streak", tier: "gold" }), null);
  });

  it("404s when badges are off", () => {
    assert.equal(
      badgeShareView({ profile: { ...profile, showBadges: false }, earned, category: "collector", tier: "gold" }),
      null,
    );
  });

  it("404s for an unknown user, category, or tier", () => {
    assert.equal(badgeShareView({ profile: null, earned, category: "collector", tier: "gold" }), null);
    assert.equal(badgeShareView({ profile, earned, category: "pokemon", tier: "gold" }), null);
    assert.equal(badgeShareView({ profile, earned, category: "collector", tier: "mythic" }), null);
  });

  it("formats the earned date", () => {
    assert.equal(earnedOnLabel("2026-10-20T15:00:00Z"), "Earned Oct 20, 2026");
    assert.equal(earnedOnLabel("not a date"), "");
  });
});
