import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasPaid, isSold } from "@/lib/format";
import { matchesFilter, summarize } from "@/lib/portfolio";
import {
  collectionTotalsFromSummarize,
  snapshotDateInNewYork,
} from "./totals-shared";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

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

describe("hasPaid (collection snapshots)", () => {
  it("requires paid not null and paid > 0", () => {
    assert.equal(hasPaid(null), false);
    assert.equal(hasPaid(0), false);
    assert.equal(hasPaid({ purchasePrice: null }), false);
    assert.equal(hasPaid({ purchasePrice: 0 }), false);
    assert.equal(hasPaid(25), true);
  });
});

describe("collectionTotalsFromSummarize", () => {
  it("maps value, invested, and combined profit like the Collection summary", () => {
    const heldPaid = card({ id: "a", purchasePrice: 100 });
    const heldUnpaid = card({ id: "b", purchasePrice: null });
    const sold = card({
      id: "c",
      purchasePrice: 80,
      sellPrice: 120,
      sellDate: "2024-06-01",
    });
    const values = new Map<string, CardValueResult>([
      ["a", okValue(150)],
      ["b", okValue(200)],
    ]);

    const totals = collectionTotalsFromSummarize(
      summarize([heldPaid, heldUnpaid, sold], values),
    );
    // Held value only: 150 + 200
    assert.equal(totals.value, 350);
    // Held paid only
    assert.equal(totals.invested, 100);
    // Unrealized 50 + realized 40
    assert.equal(totals.profit, 90);
  });

  it("leaves sold-only books with zero estimated value", () => {
    const sold = card({
      id: "s",
      purchasePrice: 50,
      sellPrice: 70,
      sellDate: "2024-06-01",
    });
    const totals = collectionTotalsFromSummarize(summarize([sold], new Map()));
    assert.equal(totals.value, 0);
    assert.equal(totals.invested, 0);
    assert.equal(totals.profit, 20);
  });
});

describe("collectionTotalsFromSummarize sold cards", () => {
  it("keeps realized profit when a confirmed deal also has a sale price", () => {
    const held = card({ id: "a", purchasePrice: 100 });
    const dealSold = card({
      id: "b",
      purchasePrice: 40,
      sellPrice: 70,
      sellDate: "2026-10-22",
      soldAt: "2026-10-22T12:00:00.000Z",
    });
    const values = new Map<string, CardValueResult>([
      ["a", okValue(150)],
      ["b", okValue(900)],
    ]);
    assert.equal(isSold(dealSold), true);
    assert.equal(matchesFilter(dealSold, "sold", values), true);
    const totals = collectionTotalsFromSummarize(summarize([held, dealSold], values));
    assert.equal(totals.value, 150);
    assert.equal(totals.invested, 100);
    assert.equal(totals.profit, 80);
  });
});

describe("no value filter", () => {
  it("matches held cards that do not have a value yet, the ones Cards tile counts", () => {
    const valued = card({ id: "a", purchasePrice: 100 });
    const missing = card({ id: "b", purchasePrice: 40 });
    const sold = card({ id: "c", purchasePrice: 40, sellPrice: 70, sellDate: "2026-10-22" });
    const values = new Map<string, CardValueResult>([["a", okValue(150)]]);
    assert.equal(matchesFilter(valued, "novalue", values), false);
    assert.equal(matchesFilter(missing, "novalue", values), true);
    assert.equal(matchesFilter(sold, "novalue", values), false);
    assert.equal(summarize([valued, missing, sold], values).withoutValueCount, 1);
  });
});

describe("snapshotDateInNewYork", () => {
  it("returns YYYY-MM-DD for a known UTC instant", () => {
    // 2026-10-16 03:30 UTC → still 2026-10-15 in America/New_York (EDT, UTC-4)
    const date = snapshotDateInNewYork(new Date("2026-10-16T03:30:00.000Z"));
    assert.equal(date, "2026-10-15");
  });
});
