import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_COLLAPSE_LINES,
  ENTRANCE_CAP,
  createLaneScrollMemory,
  entranceDelayMs,
  estimateBodyLines,
  newItemsAbove,
  postPill,
  shouldCollapseBody,
} from "@/lib/ui/timeline";
import type { Post, PublicCard } from "@/lib/social/types";

function card(partial: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "c1",
    playerName: "Victor Wembanyama",
    year: 2023,
    setBrand: "Prizm",
    cardNumber: "136",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 0,
    ...partial,
  };
}

function post(partial: Partial<Post> = {}): Post {
  return {
    id: "p1",
    authorId: "u1",
    body: "",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("postPill", () => {
  it("is null for a post without a card", () => {
    assert.equal(postPill(post()), null);
    assert.equal(postPill(post({ body: "PSA 10 talk" })), null);
  });

  it("says Pickup on a pickups post, never Mail Day", () => {
    const label = postPill(post({ postType: "mail_day", card: card() }));
    assert.equal(label, "Pickup");
  });

  it("shows the grade when the card is graded", () => {
    assert.equal(
      postPill(post({ card: card({ grade: "PSA 10", grader: "PSA", conditionType: "graded" }) })),
      "PSA 10",
    );
  });

  it("adds the grader when the grade is only a number", () => {
    assert.equal(postPill(post({ card: card({ grade: "9.5", grader: "BGS" }) })), "BGS 9.5");
  });

  it("does not call a raw card graded", () => {
    assert.equal(postPill(post({ card: card({ grade: "Raw", conditionType: "raw" }) })), "Raw");
    assert.equal(postPill(post({ card: card({ grade: "", grader: "Raw / Ungraded" }) })), "Card");
  });

  it("falls back to Rookie, then Card", () => {
    assert.equal(postPill(post({ card: card({ isRookie: true }) })), "Rookie");
    assert.equal(postPill(post({ card: card() })), "Card");
  });
});

describe("shouldCollapseBody", () => {
  it("leaves short posts alone", () => {
    assert.equal(shouldCollapseBody("Clark Prizm comps are still sticky."), false);
    assert.equal(shouldCollapseBody(""), false);
  });

  it(`collapses text past ${BODY_COLLAPSE_LINES} lines`, () => {
    assert.equal(shouldCollapseBody("one\ntwo\nthree\nfour\nfive\nsix\nseven"), true);
    assert.equal(shouldCollapseBody("word ".repeat(80)), true);
  });

  it("counts wrapped lines at phone width", () => {
    assert.equal(estimateBodyLines("a".repeat(38)), 1);
    assert.equal(estimateBodyLines("a".repeat(39)), 2);
    assert.equal(estimateBodyLines("a\n\nb"), 3);
  });
});

describe("newItemsAbove", () => {
  it("counts new items that land above the reader's spot", () => {
    assert.equal(newItemsAbove(["a", "b", "c"], ["x", "y", "a", "b", "c"], "b"), 2);
  });

  it("ignores new items below the spot, like a loaded page", () => {
    assert.equal(newItemsAbove(["a", "b"], ["a", "b", "c", "d"], "a"), 0);
  });

  it("is zero at the top of the feed or when the spot is gone", () => {
    assert.equal(newItemsAbove(["a"], ["x", "a"], null), 0);
    assert.equal(newItemsAbove(["a"], ["x", "y"], "a"), 0);
  });

  it("is zero on the first load", () => {
    assert.equal(newItemsAbove([], ["x", "a"], "a"), 0);
  });
});

describe("entranceDelayMs", () => {
  it("staggers the first few items, then stops animating", () => {
    assert.equal(entranceDelayMs(0), 0);
    assert.ok((entranceDelayMs(1) ?? 0) > 0);
    assert.ok((entranceDelayMs(ENTRANCE_CAP - 1) ?? 0) <= 300);
    assert.equal(entranceDelayMs(ENTRANCE_CAP), null);
    assert.equal(entranceDelayMs(40), null);
  });
});

describe("createLaneScrollMemory", () => {
  it("restores each lane's spot", () => {
    const memory = createLaneScrollMemory();
    memory.save("foryou", 900);
    assert.equal(memory.target("following", { current: 900, laneTop: 200 }), 200);
    memory.save("following", 450);
    assert.equal(memory.target("foryou", { current: 450, laneTop: 200 }), 900);
    assert.equal(memory.target("following", { current: 900, laneTop: 200 }), 450);
  });

  it("keeps the page still when the reader is above the tabs", () => {
    const memory = createLaneScrollMemory();
    memory.save("foryou", 40);
    assert.equal(memory.target("following", { current: 40, laneTop: 200 }), 40);
  });
});
