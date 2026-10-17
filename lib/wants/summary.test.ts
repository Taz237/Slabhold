import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CardValueResult } from "@/lib/value/types";
import { summarizeWants, type WantCardRef } from "./summary-pick";

const viewer = "viewer";
const other = "other-user";

function value(median: number): CardValueResult {
  return {
    status: "ok",
    median,
    low: median,
    high: median,
    nSales: 2,
    matchedAt: null,
  };
}

const privateOther: WantCardRef = {
  id: "private-other",
  userId: other,
  isPublic: false,
  cardKey: "jordan love|2020|select|47|base|psa 10",
};

const publicCopy: WantCardRef = {
  id: "public-copy",
  userId: other,
  isPublic: true,
  cardKey: privateOther.cardKey,
};

const ownCopy: WantCardRef = {
  id: "own-copy",
  userId: viewer,
  isPublic: false,
  cardKey: privateOther.cardKey,
};

describe("want summaries", () => {
  it("returns value null for a want pointing at another user's private card", () => {
    const values = new Map([[privateOther.id, value(40)]]);
    const prices = new Map([[privateOther.id, 20]]);
    const [summary] = summarizeWants(
      viewer,
      [
        {
          id: "want-1",
          label: "Jordan Love PSA 10",
          targetPrice: 35,
          cardKey: privateOther.cardKey,
          sourceCardId: privateOther.id,
        },
      ],
      [privateOther],
      values,
      prices,
    );
    assert.equal(summary.value, null);
    assert.equal(summary.deal, false);
  });

  it("returns the value for a public card and for the viewer's own card", () => {
    const values = new Map([
      [publicCopy.id, value(41)],
      [ownCopy.id, value(42)],
      [privateOther.id, value(99)],
    ]);
    const prices = new Map<string, number | null>([
      [publicCopy.id, 30],
      [ownCopy.id, 28],
    ]);
    const summaries = summarizeWants(
      viewer,
      [
        {
          id: "public-want",
          label: "Public",
          targetPrice: 35,
          cardKey: publicCopy.cardKey,
          sourceCardId: publicCopy.id,
        },
        {
          id: "own-want",
          label: "Own",
          targetPrice: 35,
          cardKey: ownCopy.cardKey,
          sourceCardId: ownCopy.id,
        },
      ],
      [privateOther, publicCopy, ownCopy],
      values,
      prices,
    );
    assert.equal(summaries[0].value?.median, 41);
    assert.equal(summaries[0].deal, true);
    assert.equal(summaries[1].value?.median, 42);
    assert.equal(summaries[1].deal, true);
  });

  it("falls back to a visible card with the same card_key", () => {
    const values = new Map([
      [privateOther.id, value(99)],
      [publicCopy.id, value(33)],
    ]);
    const [summary] = summarizeWants(
      viewer,
      [
        {
          id: "want-1",
          label: "Fallback",
          targetPrice: null,
          cardKey: privateOther.cardKey,
          sourceCardId: privateOther.id,
        },
      ],
      [privateOther, publicCopy],
      values,
      new Map(),
    );
    assert.equal(summary.value?.median, 33);
    assert.equal(summary.deal, false);
  });
});
