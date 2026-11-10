import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addedCollectionLine,
  addedCollectionTotals,
  collectionLineText,
  milestoneFor,
} from "@/lib/cards/added-panel";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

function card(id: string, patch: Partial<SportsCard> = {}): SportsCard {
  return {
    id,
    playerName: "Fixture Player",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Panini Prizm",
    cardNumber: "1",
    grade: "Raw",
    conditionType: "raw",
    parallel: "Base",
    serialRun: null,
    serialNo: null,
    isAuto: false,
    sport: "Football",
    purchasePrice: null,
    purchaseDate: "",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7C3AED",
    createdAt: "2026-10-28T00:00:00.000Z",
    ...patch,
  } as unknown as SportsCard;
}

function many(count: number, patch: Partial<SportsCard> = {}): SportsCard[] {
  return Array.from({ length: count }, (_, index) => card(`c-${index}`, patch));
}

const ok = (median: number): CardValueResult => ({
  status: "ok",
  median,
  low: median,
  high: median,
  nSales: 6,
  matchedAt: null,
});

describe("milestoneFor", () => {
  it("names the 1st, 10th, 25th, 50th, 100th, 250th and 500th card", () => {
    const first = card("new");
    assert.equal(milestoneFor([first], first), "Your first card.");
    for (const count of [10, 25, 50, 100, 250, 500]) {
      const cards = many(count - 1);
      const added = card("new");
      assert.equal(milestoneFor([...cards, added], added), `Card ${count} in your collection.`);
    }
    for (const count of [2, 9, 11, 24, 26, 99, 101]) {
      const cards = many(count - 1);
      const added = card("new");
      assert.equal(milestoneFor([...cards, added], added), null, `no line at ${count}`);
    }
  });

  it("calls out the first slab and the first numbered card", () => {
    const slab = card("new", { conditionType: "graded", grade: "PSA 10" });
    assert.equal(milestoneFor([...many(3), slab], slab), "Your first slab.");
    assert.equal(
      milestoneFor([...many(3), card("old", { conditionType: "graded", grade: "BGS 9.5" }), slab], slab),
      null,
      "not the first slab",
    );
    const numbered = card("new", { serialRun: 99 });
    assert.equal(milestoneFor([...many(3), numbered], numbered), "Your first numbered card.");
    assert.equal(milestoneFor([...many(3, { serialRun: 25 }), numbered], numbered), null);
  });

  it("shows one line: count beats first slab, which beats first numbered", () => {
    const both = card("new", { conditionType: "graded", grade: "PSA 10", serialRun: 10 });
    assert.equal(milestoneFor([...many(9), both], both), "Card 10 in your collection.");
    assert.equal(milestoneFor([...many(4), both], both), "Your first slab.");
    assert.equal(milestoneFor([both], both), "Your first card.");
  });

  it("says nothing when the card is not in the collection yet", () => {
    assert.equal(milestoneFor(many(9), card("new")), null);
  });

  it("is plain: no emoji, no exclamation marks, no hype", () => {
    const lines = [
      milestoneFor([card("a")], card("a")),
      milestoneFor([...many(24), card("a")], card("a")),
      milestoneFor([...many(2), card("a", { conditionType: "graded" })], card("a", { conditionType: "graded" })),
      milestoneFor([...many(2), card("a", { serialRun: 5 })], card("a", { serialRun: 5 })),
    ];
    for (const line of lines) {
      assert.ok(line);
      assert.doesNotMatch(line, /!|[\u{1F300}-\u{1FAFF}]|free|amazing|congrat/iu);
      assert.ok(line.length <= 32, line);
    }
  });
});

describe("collection totals for the tick-up", () => {
  it("gives the old total (without this card) and the new one", () => {
    const cards = [card("a"), card("b"), card("new")];
    const values = new Map([
      ["a", ok(10)],
      ["b", ok(20)],
      ["new", ok(42)],
    ]);
    const totals = addedCollectionTotals(cards, values, true, "new");
    assert.equal(totals.count, 3);
    assert.equal(totals.total, 72);
    assert.equal(totals.previous, 30);
    assert.equal(collectionLineText(totals.count, totals.total), "Your collection: 3 cards, about $72.00");
    assert.equal(addedCollectionLine(cards, values, true), "Your collection: 3 cards, about $72.00");
  });

  it("has no previous total for the first valued card, so it never animates from $0", () => {
    const cards = [card("a"), card("new")];
    const totals = addedCollectionTotals(cards, new Map([["new", ok(42)]]), true, "new");
    assert.equal(totals.total, 42);
    assert.equal(totals.previous, null);
  });

  it("shows no dollar figure until values are in, and never $0", () => {
    const cards = [card("a"), card("new")];
    const pending = addedCollectionTotals(cards, new Map([["a", ok(10)]]), false, "new");
    assert.equal(pending.total, null);
    assert.equal(pending.previous, null);
    assert.equal(collectionLineText(2, null), "Your collection: 2 cards");
    const none = addedCollectionTotals(cards, new Map(), true, "new");
    assert.equal(none.total, null);
    assert.equal(collectionLineText(1, 0), "Your collection: 1 card");
    assert.doesNotMatch(collectionLineText(2, 0.004), /\$/);
  });

  it("keeps the old total equal to the new one when this card has no value yet", () => {
    const cards = [card("a"), card("new")];
    const totals = addedCollectionTotals(cards, new Map([["a", ok(10)]]), true, "new");
    assert.equal(totals.total, 10);
    assert.equal(totals.previous, 10);
  });
});
