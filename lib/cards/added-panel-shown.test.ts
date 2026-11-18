import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { valueFromShownSales } from "@/lib/comps/shared-value";
import type { CompListing } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { addedBigPrice, addedValueLine, hiddenSalesNote, recentSoldPrices } from "./added-panel";

/**
 * The Added panel's figure is the card page's own: the sales on screen. card_values can lag or
 * count differently (9 sales and $9.99 for a Shimmer the page lists 3 sales of), and the panel
 * must never show another figure than the page.
 */

const comp = (soldPrice: number, soldDate: string, id: string): CompListing => ({ id, title: "2026-27 Topps Darryn Peterson #257 Shimmer RC", soldPrice, soldDate }) as unknown as CompListing;
const ON_SCREEN = [comp(6, "2026-11-13", "a"), comp(6, "2026-11-13", "b"), comp(10.49, "2026-11-13", "c")];
const CARD_VALUES: CardValueResult = { status: "ok", median: 9.99, low: 6, high: 14, nSales: 9, matchedAt: "2026-11-18T19:30:00.000Z" };

describe("the Added panel's figure", () => {
  it("card_values says 9 sales and $9.99, the page shows 3 sales: the panel shows the page's figure and count", () => {
    const shown = valueFromShownSales(ON_SCREEN, CARD_VALUES);
    assert.equal(shown.nSales, 3);
    assert.equal(shown.median, 6);
    assert.deepEqual(addedBigPrice(shown), { amount: "$6.00", detail: "3 recent sales" });
    assert.equal(addedValueLine(shown, false).text, "Worth about $6.00 based on 3 recent sales.");
    // What the stored value alone would have said: the figure the live panel showed.
    assert.deepEqual(addedBigPrice(CARD_VALUES), { amount: "$9.99", detail: "9 recent sales" });
  });

  it("the card page hands the panel its shown value, never card_values on its own", () => {
    const source = readFileSync("components/card-detail.tsx", "utf8");
    const panel = source.slice(source.indexOf("<LazyCardAddedPanel"), source.indexOf("/>", source.indexOf("<LazyCardAddedPanel")));
    assert.match(panel, /value=\{shownValue\}/);
    assert.doesNotMatch(panel, /value=\{cardValue\}/);
  });

  it("the short list says how many it leaves out", () => {
    assert.equal(recentSoldPrices(ON_SCREEN).length, 3);
    assert.equal(hiddenSalesNote(3, 3), null);
    assert.equal(hiddenSalesNote(9, 3), "The 3 newest of 9");
    assert.equal(hiddenSalesNote(null, 3), null);
    assert.equal(hiddenSalesNote(9, 0), null);
  });
});
