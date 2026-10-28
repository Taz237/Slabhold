import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addedRevealLine, recentSoldPrices } from "@/lib/cards/added-panel";
import { confidenceCopy, matchConfidence, NOT_SURE_PARALLEL } from "@/lib/value/match-confidence";
import type { CardValueResult } from "@/lib/value/types";

const value: CardValueResult = {
  status: "ok",
  median: 42,
  low: 30,
  high: 50,
  nSales: 6,
  matchedAt: null,
};

const base = {
  year: 2024,
  yearLabel: "2024",
  setBrand: "Panini Prizm",
  parallel: "Base",
  serialRun: null,
  isAuto: false,
};

function line(card: typeof base, input: Partial<Parameters<typeof addedRevealLine>[0]> = {}) {
  const confidence = matchConfidence(card, input.value ?? value);
  return addedRevealLine({
    cardId: "card-1",
    value,
    loading: false,
    card,
    confidence,
    copy: confidenceCopy(confidence, card),
    ...input,
  });
}

describe("finish reveal value line", () => {
  it("shows Worth about $X only for a strong match", () => {
    assert.deepEqual(line(base), { kind: "ok", text: "Worth about $42.00 based on 6 recent sales." });
  });

  it("shows no dollar figure for weak or none", () => {
    const weak = line({ ...base, parallel: "Gold /10" });
    assert.equal(weak.kind, "weak");
    assert.equal(weak.text, "We need one more detail to price this");
    assert.ok("fix" in weak && weak.fix?.href === "/cards/card-1/edit");
    const none = line({ ...base, parallel: NOT_SURE_PARALLEL });
    assert.equal(none.kind, "none");
    assert.equal(none.text, "No price yet");
    assert.ok("fix" in none && none.fix?.label === "Pick your parallel to see a price");
    const lone = line(
      { ...base, parallel: "Purple", serialRun: 99 as unknown as null, isAuto: true },
      { value: { ...value, nSales: 1, median: 2 } },
    );
    assert.equal(lone.kind, "weak");
    for (const read of [weak, none, lone]) assert.doesNotMatch(read.text, /\$/);
  });

  it("keeps the skeleton copy while a strong card's value is pending", () => {
    assert.deepEqual(line(base, { value: null, loading: true }), {
      kind: "pending",
      text: "Finding recent sales…",
    });
  });
});

describe("recent sold prices", () => {
  it("lists up to three, newest first, with a day", () => {
    const list = recentSoldPrices([
      { id: "a", soldPrice: 10, soldDate: "2026-09-01T00:00:00Z" },
      { id: "b", soldPrice: 12, soldDate: "2026-10-20T00:00:00Z" },
      { id: "c", soldPrice: 0, soldDate: "2026-10-25T00:00:00Z" },
      { id: "d", soldPrice: 11, soldDate: "2026-10-01T00:00:00Z" },
      { id: "e", soldPrice: 9, soldDate: "2026-08-01T00:00:00Z" },
    ]);
    assert.deepEqual(
      list.map((sale) => [sale.key, sale.priceText, sale.dateText]),
      [
        ["b", "$12.00", "Oct 20"],
        ["d", "$11.00", "Oct 1"],
        ["a", "$10.00", "Sep 1"],
      ],
    );
    assert.deepEqual(recentSoldPrices(null), []);
    assert.deepEqual(recentSoldPrices([]), []);
  });
});
