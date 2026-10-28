import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoPins, formatPin, parsePin, profilePins, togglePin, upgradePins } from "./pins";
import { profileBadgeView } from "./visibility";
import type { EarnedBadge } from "./progress";

const earned: EarnedBadge[] = [
  { category: "collector", tier: "bronze" },
  { category: "collector", tier: "silver" },
  { category: "collector", tier: "gold" },
  { category: "streak", tier: "bronze" },
  { category: "slab-king", tier: "bronze" },
  { category: "slab-king", tier: "silver" },
  { category: "following", tier: "bronze" },
];

describe("pin strings", () => {
  it("round-trips category:tier and rejects junk", () => {
    assert.deepEqual(parsePin("collector:gold"), { category: "collector", tier: "gold" });
    assert.equal(formatPin({ category: "slab-king", tier: "diamond" }), "slab-king:diamond");
    assert.equal(parsePin("collector:mythic"), null);
    assert.equal(parsePin("pokemon:gold"), null);
    assert.equal(parsePin("collector"), null);
  });
});

describe("auto-pin", () => {
  it("pins the 3 highest tiers, one per category", () => {
    assert.deepEqual(autoPins(earned), [
      { category: "collector", tier: "gold" },
      { category: "slab-king", tier: "silver" },
      { category: "streak", tier: "bronze" },
    ]);
  });

  it("returns fewer when fewer are earned, and nothing for none", () => {
    assert.deepEqual(autoPins([{ category: "leaderboard", tier: "bronze" }]), [
      { category: "leaderboard", tier: "bronze" },
    ]);
    assert.deepEqual(autoPins([]), []);
  });

  it("uses saved pins when there are any, and auto-pins when the list is empty", () => {
    assert.deepEqual(profilePins([], earned), autoPins(earned));
    assert.deepEqual(profilePins(["following:bronze", "streak:bronze"], earned), [
      { category: "following", tier: "bronze" },
      { category: "streak", tier: "bronze" },
    ]);
  });

  it("drops pins that are not earned, repeated, or past 3", () => {
    assert.deepEqual(
      profilePins(
        ["collector:legendary", "streak:bronze", "streak:bronze", "collector:gold", "following:bronze", "slab-king:bronze"],
        earned,
      ),
      [
        { category: "streak", tier: "bronze" },
        { category: "collector", tier: "gold" },
        { category: "following", tier: "bronze" },
      ],
    );
    assert.deepEqual(profilePins(["collector:legendary"], earned), autoPins(earned));
  });
});

describe("pin upgrades", () => {
  it("shows the highest earned tier for a pinned category", () => {
    // collector:bronze was pinned before Gold was earned.
    assert.deepEqual(profilePins(["collector:bronze", "streak:bronze"], earned), [
      { category: "collector", tier: "gold" },
      { category: "streak", tier: "bronze" },
    ]);
  });

  it("upgrades the saved pins, merges repeats, and keeps order", () => {
    assert.deepEqual(upgradePins(["streak:bronze", "collector:bronze", "collector:silver"], earned), [
      "streak:bronze",
      "collector:gold",
    ]);
    assert.deepEqual(upgradePins(["slab-king:bronze"], earned), ["slab-king:silver"]);
  });

  it("leaves pins alone when nothing higher is earned, and drops pins that are not earned", () => {
    assert.deepEqual(upgradePins(["collector:gold", "following:bronze"], earned), [
      "collector:gold",
      "following:bronze",
    ]);
    assert.deepEqual(upgradePins(["rainbow-chaser:bronze", "junk"], earned), []);
    assert.deepEqual(upgradePins([], earned), []);
  });

  it("lets the owner unpin an upgraded badge", () => {
    const shown = profilePins(["collector:bronze"], earned).map(formatPin);
    assert.deepEqual(togglePin(shown, { category: "collector", tier: "gold" }).pins, []);
  });
});

describe("pin and unpin", () => {
  it("adds up to 3 and refuses a 4th", () => {
    let pins: string[] = [];
    pins = togglePin(pins, { category: "collector", tier: "gold" }).pins;
    pins = togglePin(pins, { category: "streak", tier: "bronze" }).pins;
    pins = togglePin(pins, { category: "following", tier: "bronze" }).pins;
    assert.deepEqual(pins, ["collector:gold", "streak:bronze", "following:bronze"]);
    const full = togglePin(pins, { category: "slab-king", tier: "silver" });
    assert.equal(full.full, true);
    assert.deepEqual(full.pins, pins);
  });

  it("unpins a pinned badge", () => {
    const result = togglePin(["collector:gold", "streak:bronze"], { category: "collector", tier: "gold" });
    assert.deepEqual(result.pins, ["streak:bronze"]);
    assert.equal(result.full, false);
  });
});

describe("profile strip visibility", () => {
  const base = {
    ownerId: "owner",
    showBadges: true,
    earned,
    pinned: [] as string[],
    firstGoal: { value: 3 },
  };

  it("hides badges on another user's profile when show_badges is off", () => {
    assert.deepEqual(profileBadgeView({ ...base, viewerId: "someone", showBadges: false }), { kind: "hidden" });
    assert.deepEqual(profileBadgeView({ ...base, viewerId: null, showBadges: false }), { kind: "hidden" });
  });

  it("hides the strip on another user's profile with no badges", () => {
    assert.deepEqual(profileBadgeView({ ...base, viewerId: "someone", earned: [] }), { kind: "hidden" });
  });

  it("shows 3 pins and a +N chip for the rest", () => {
    const view = profileBadgeView({ ...base, viewerId: "someone" });
    assert.equal(view.kind, "strip");
    if (view.kind !== "strip") return;
    assert.equal(view.pins.length, 3);
    assert.equal(view.more, 4);
  });

  it("shows the first-badge line on your own profile with none", () => {
    assert.deepEqual(profileBadgeView({ ...base, viewerId: "owner", earned: [] }), {
      kind: "first",
      line: "Earn your first badge: add 10 cards",
      progress: 0.3,
    });
  });

  it("hides your own strip when you turned badges off", () => {
    assert.deepEqual(profileBadgeView({ ...base, viewerId: "owner", showBadges: false }), { kind: "hidden" });
  });
});
