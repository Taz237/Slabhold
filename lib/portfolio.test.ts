import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasPaid } from "./format";
import { summarize } from "./portfolio";
import type { SportsCard } from "./types";
import type { CardValueResult } from "./value/types";

function card(
  partial: Partial<SportsCard> & Pick<SportsCard, "id" | "purchasePrice">,
): SportsCard {
  return {
    playerName: "Player",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Prizm",
    setIsCustom: false,
    cardNumber: "1",
    noNumber: false,
    grade: "Raw",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    gradeQualifier: "",
    certNumber: "",
    sport: "Basketball",
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function okValue(median: number): CardValueResult {
  return {
    status: "ok",
    median,
    low: median - 10,
    high: median + 10,
    nSales: 5,
    matchedAt: "2024-01-02T00:00:00.000Z",
  };
}

describe("summarize uses sales-backed values", () => {
  it("skips a median that has no matching sales", () => {
    const held = card({ id: "bare", purchasePrice: 20 });
    const values = new Map<string, CardValueResult>([
      ["bare", { ...okValue(80), nSales: 0 }],
    ]);
    assert.equal(summarize([held], values).estimatedValue, 0);
    assert.equal(summarize([held], values).withoutValueCount, 1);
  });
});

describe("hasPaid", () => {
  it("is false for null, undefined, and 0", () => {
    assert.equal(hasPaid(null), false);
    assert.equal(hasPaid(undefined), false);
    assert.equal(hasPaid(0), false);
    assert.equal(hasPaid({ purchasePrice: null }), false);
    assert.equal(hasPaid({ purchasePrice: 0 }), false);
  });

  it("is true for a positive price", () => {
    assert.equal(hasPaid(1), true);
    assert.equal(hasPaid({ purchasePrice: 12.5 }), true);
  });
});

describe("summarize profit excludes unpaid", () => {
  it("keeps estimated value for unpaid cards but excludes them from invested and profit", () => {
    const paid = card({ id: "a", purchasePrice: 100 });
    const unpaid = card({ id: "b", purchasePrice: null });
    const zero = card({ id: "c", purchasePrice: 0 });
    const values = new Map<string, CardValueResult>([
      ["a", okValue(150)],
      ["b", okValue(200)],
      ["c", okValue(50)],
    ]);

    const totals = summarize([paid, unpaid, zero], values);
    assert.equal(totals.invested, 100);
    assert.equal(totals.estimatedValue, 400);
    assert.equal(totals.unrealizedProfit, 50);
    assert.equal(totals.realizedProfit, 0);
    assert.equal(totals.unpaidExcludedCount, 2);
  });
});
