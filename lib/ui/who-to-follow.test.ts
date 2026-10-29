import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUGGESTION_RAIL_SIZE,
  WHO_TO_FOLLOW_EVERY,
  WHO_TO_FOLLOW_SIZE,
  inlineSuggestionPool,
  whoToFollowAfter,
} from "./timeline";

const people = Array.from({ length: 8 }, (_, index) => `p${index}`);
const ranked = Array.from({ length: 20 }, (_, index) => ({ id: `u${index}` }));
const ids = (list: { id: string }[]) => list.map((person) => person.id);

function pool(overrides: Partial<Parameters<typeof inlineSuggestionPool>[0]> = {}) {
  return inlineSuggestionPool({
    ranked,
    railIds: ids(ranked.slice(0, SUGGESTION_RAIL_SIZE)),
    viewerId: "me",
    officialId: null,
    followingIds: [],
    blockedIds: [],
    mutedIds: [],
    ...overrides,
  });
}

describe("whoToFollowAfter", () => {
  it("drops a card in after every 15th post, with the next few people each time", () => {
    assert.equal(WHO_TO_FOLLOW_EVERY, 15);
    assert.equal(WHO_TO_FOLLOW_SIZE, 3);
    assert.deepEqual(whoToFollowAfter(14, people), ["p0", "p1", "p2"]);
    assert.deepEqual(whoToFollowAfter(29, people), ["p3", "p4", "p5"]);
    assert.deepEqual(whoToFollowAfter(44, people), ["p6", "p7"]);
  });

  it("shows nothing between slots, once people run out, or with nobody to suggest", () => {
    assert.deepEqual(whoToFollowAfter(0, people), []);
    assert.deepEqual(whoToFollowAfter(15, people), []);
    assert.deepEqual(whoToFollowAfter(59, people), []);
    assert.deepEqual(whoToFollowAfter(14, []), []);
  });
});

describe("inlineSuggestionPool", () => {
  it("starts after the rail, so the first inline card never repeats it", () => {
    const rest = pool();
    assert.equal(rest[0]?.id, `u${SUGGESTION_RAIL_SIZE}`);
    const rail = new Set(ids(ranked.slice(0, SUGGESTION_RAIL_SIZE)));
    assert.ok(rest.every((person) => !rail.has(person.id)));
  });

  it("leaves out followed (even since the rail rendered), blocked, muted, self and the updates account", () => {
    const rest = pool({
      ranked: [...ranked, { id: "me" }, { id: "OFFICIAL" }],
      followingIds: ["u8"],
      blockedIds: ["u9"],
      mutedIds: ["u10"],
      officialId: "official",
    });
    assert.deepEqual(ids(rest).slice(0, 3), ["u11", "u12", "u13"]);
    assert.ok(!ids(rest).includes("me"));
    assert.ok(!ids(rest).includes("OFFICIAL"));
  });

  it("never puts a person on the page twice, and runs out instead of recycling", () => {
    const rest = pool({ ranked: [...ranked, { id: "u12" }, { id: "u3" }] });
    const shown: string[] = [];
    for (let index = 0; index < 300; index++) shown.push(...ids(whoToFollowAfter(index, rest)));
    shown.push(...ids(ranked.slice(0, SUGGESTION_RAIL_SIZE)));
    assert.equal(new Set(shown).size, shown.length);
    assert.equal(shown.length, ranked.length);
    // 12 left after an 8-person rail: four cards, then no more.
    assert.deepEqual(whoToFollowAfter(74, rest), []);
  });
});
