import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardValue } from "@/components/card-page/card-value";
import { ROUGH_VALUE_NOTE, recentSalesLine } from "@/components/card-page/value-head";
import type { ChartSale } from "@/lib/chart/sales";
import { lowConfidencePlacement } from "@/lib/value/low-confidence-placement";
import type { PriceRead } from "@/lib/value/price-fallback";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const estimate: PriceRead = { kind: "estimate", text: "$34.00", isEstimate: true, showEbaySold: false };

function sales(count: number): ChartSale[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    price: 30 + index * 2,
    date: `2026-10-${String(10 + index).padStart(2, "0")}`,
  }));
}

function value(count: number, rough?: boolean) {
  return renderToStaticMarkup(
    createElement(CardValue, { read: estimate, amount: 34, count, sales: sales(count), live: true, rough }),
  );
}

describe("thin data: honest, calm, once", () => {
  it("says a 3-sale value is rough in the value line, in soft words", () => {
    const html = value(3);
    assert.match(html, /3 recent sales, rough value/);
    assert.equal(html.split("rough value").length - 1, 1);
  });

  it("is never a loud amber tag, and never the old wording", () => {
    for (const file of [
      "components/card-page/card-value.tsx",
      "components/card-page/value-head.tsx",
      "components/public-card-view.tsx",
      "components/card-detail.tsx",
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /Low confidence/, file);
      assert.doesNotMatch(src, /bg-amber-500\/15 px-1\.5/, file);
    }
    assert.equal(ROUGH_VALUE_NOTE, "Few sales, rough value");
  });

  it("does not show with 5 or more sales or none", () => {
    assert.doesNotMatch(value(6), /rough value/);
    assert.equal(recentSalesLine(6), "6 recent sales");
    assert.equal(recentSalesLine(1), "1 recent sale");
    assert.equal(recentSalesLine(0), "");
  });

  it("moves under Recent sales when the value line cannot say it, never both", () => {
    // The owner's page: the caller decides. With the note under Recent sales, the value line stays quiet.
    assert.doesNotMatch(value(3, false), /rough value/);
    assert.equal(lowConfidencePlacement({ salesCount: 3, live: true, estimate: false, showChart: true }), "caption");
    assert.equal(lowConfidencePlacement({ salesCount: 3, live: true, estimate: true, showChart: true }), "chart");
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /rough=\{roughShown\}/);
    assert.match(detail, /roughInList \?/);
  });
});
