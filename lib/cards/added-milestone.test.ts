import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { milestoneFor } from "@/lib/cards/added-panel";
import type { SportsCard } from "@/lib/types";

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
