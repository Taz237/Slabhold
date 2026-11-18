import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { soldCount, type SoldsState } from "@/lib/scan/comp";
import { LastSold } from "./sheet-parts";

/** The Add card sheet's price line says how many sales it stands on: "3 sold". Sample sales only. */

const sale = (priceCents: number) => ({ priceCents, soldAt: "2026-11-10T18:00:00.000Z" });

function okSolds(nSales: number): SoldsState {
  const sales = Array.from({ length: Math.min(nSales, 10) }, (_, index) => sale(4000 + index * 100));
  return {
    status: "done",
    query: "fixture",
    comp: { status: "ok", sales, nSales, medianCents: nSales >= 3 ? 4100 : null, lowCents: null, highCents: null, trend: null, asOf: null, source: "live" },
  };
}

const text = (solds: SoldsState, pick: string | null = null) => renderToStaticMarkup(createElement(LastSold, { solds, pick })).replace(/<[^>]+>/g, " ");

describe("the price line's sale count", () => {
  it("reads '1 sold' and '3 sold', never a bare number", () => {
    assert.equal(soldCount(1), "1 sold");
    assert.equal(soldCount(3), "3 sold");
  });

  it("the last sold price says how many sales it's from", () => {
    assert.match(text(okSolds(3)), /\$40\.00/);
    assert.match(text(okSolds(3)), /3 sold/);
    assert.match(text(okSolds(1)), /1 sold/);
  });

  it("a picked parallel's price says how many of its sales there are", () => {
    const solds: SoldsState = {
      status: "done",
      query: "fixture",
      comp: {
        status: "split",
        groups: [
          { label: "Black", nSales: 2, lastPriceCents: 4000, lastSoldAt: "2026-11-10T18:00:00.000Z" },
          { label: "Gold", nSales: 4, lastPriceCents: 9000, lastSoldAt: "2026-11-09T18:00:00.000Z" },
        ],
      },
    };
    assert.match(text(solds, "Black"), /2 sold/);
    assert.doesNotMatch(text(solds, "Black"), /4 sold/);
  });
});
