import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarize } from "@/lib/portfolio";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import {
  investedAmountLabel,
  investedCardLabel,
  profitAmountLabel,
  profitAmountTone,
  profitCardLabel,
  sumPaid,
} from "./profit-label";

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
    sport: "Football",
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
    low: null,
    high: null,
    nSales: 6,
    matchedAt: "2026-10-16T00:00:00.000Z",
  };
}

describe("profit card labels", () => {
  it("0 of 4 shows an em dash and 1 of 4 names the cards", () => {
    assert.equal(profitCardLabel(0, 4), "—");
    assert.equal(investedCardLabel(0, 4), "");
    assert.equal(investedAmountLabel(0), "$0");
    assert.equal(profitAmountTone(0, 0), "neutral");

    const cards = [
      card({ id: "1", purchasePrice: null }),
      card({ id: "2", purchasePrice: 0 }),
      card({ id: "3", purchasePrice: 40 }),
      card({ id: "4", purchasePrice: 20 }),
    ];
    const none = summarize(cards, new Map());
    assert.equal(none.pricedCount, 0);
    assert.equal(profitCardLabel(none.pricedCount, cards.length), "—");
    assert.equal(profitAmountLabel(none.pricedCount, none.unrealizedProfit), "—");
    assert.equal(sumPaid(cards), 60);
    assert.equal(investedAmountLabel(sumPaid(cards)), "$60");
    assert.equal(investedCardLabel(2, cards.length), "Invested on 2 of 4 cards");

    const one = summarize(cards, new Map([["4", okValue(35)]]));
    assert.equal(one.pricedCount, 1);
    assert.equal(profitCardLabel(one.pricedCount, cards.length), "Profit on 1 of 4 cards");
    assert.equal(profitAmountLabel(one.pricedCount, 15), "+$15");
    assert.equal(one.pricedInvested, 20);
    assert.equal(profitAmountTone(1, 15), "up");
    assert.equal(profitAmountTone(1, -5), "down");
    assert.equal(profitAmountTone(1, 0), "neutral");
  });

  it("shows $13 invested when the paid card has no current value", () => {
    const cards = [
      card({ id: "paid", purchasePrice: 13 }),
      card({ id: "unpaid", purchasePrice: null }),
    ];
    const totals = summarize(cards, new Map());
    assert.equal(sumPaid(cards), 13);
    assert.equal(investedAmountLabel(sumPaid(cards)), "$13");
    assert.equal(investedCardLabel(1, cards.length), "Invested on 1 of 2 cards");
    assert.equal(totals.pricedCount, 0);
    assert.equal(profitAmountLabel(totals.pricedCount, totals.unrealizedProfit), "—");
    assert.equal(profitCardLabel(totals.pricedCount, cards.length), "—");
  });
});
