import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WHO_TO_FOLLOW_EVERY, WHO_TO_FOLLOW_SIZE, whoToFollowAfter } from "./timeline";

const people = Array.from({ length: 8 }, (_, index) => `p${index}`);

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
