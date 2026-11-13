import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { salesDots, salesDotsLabel } from "./sales-dots";

const sale = (priceCents: number, day: string) => ({ priceCents, soldAt: `2026-11-${day}T12:00:00Z` });

describe("salesDots: every dot is a real sale", () => {
  const sales = [sale(110000, "06"), sale(106000, "05"), sale(101000, "04"), sale(94000, "03"), sale(91000, "02")];

  it("places one dot per dated sale, oldest left, highest price on top, inside the box", () => {
    const chart = salesDots(sales, { width: 300, height: 96, medianCents: 101000, lowCents: 94000, highCents: 106000 });
    assert.ok(chart);
    assert.equal(chart.dots.length, 5);
    const byX = [...chart.dots].sort((a, b) => a.x - b.x);
    assert.deepEqual(byX.map((dot) => dot.priceCents), [91000, 94000, 101000, 106000, 110000]);
    for (const dot of chart.dots) {
      assert.ok(dot.x >= 6 && dot.x <= 294, `x ${dot.x}`);
      assert.ok(dot.y >= 6 && dot.y <= 90, `y ${dot.y}`);
    }
    const top = chart.dots.find((dot) => dot.priceCents === 110000)!;
    const bottom = chart.dots.find((dot) => dot.priceCents === 91000)!;
    assert.ok(top.y < bottom.y);
  });

  it("marks only the newest sale, and draws the median and the middle band where the prices are", () => {
    const chart = salesDots(sales, { width: 300, height: 96, medianCents: 101000, lowCents: 94000, highCents: 106000 })!;
    assert.deepEqual(chart.dots.filter((dot) => dot.newest).map((dot) => dot.priceCents), [110000]);
    const median = chart.dots.find((dot) => dot.priceCents === 101000)!;
    assert.equal(chart.medianY, median.y);
    assert.ok(chart.band && chart.band.top < chart.medianY! && chart.band.bottom > chart.medianY!);
  });

  it("needs three dated sales: fewer is no chart, and undated sales are left out", () => {
    assert.equal(salesDots(sales.slice(0, 2), { width: 300, height: 96 }), null);
    assert.equal(salesDots([sale(100, "01"), sale(200, "02"), { priceCents: 300, soldAt: null }], { width: 300, height: 96 }), null);
    assert.equal(salesDots([...sales, { priceCents: 500000, soldAt: null }], { width: 300, height: 96 })!.dots.length, 5);
  });

  it("same-day and same-price sales still fit the box", () => {
    const flat = salesDots([sale(5000, "03"), sale(5000, "03"), sale(5000, "03")], { width: 300, height: 96 })!;
    for (const dot of flat.dots) assert.ok(Number.isFinite(dot.x) && Number.isFinite(dot.y));
    assert.equal(new Set(flat.dots.map((dot) => dot.x)).size, 3, "same-day sales sit side by side, not on top of each other");
  });

  it("says what it shows in words", () => {
    assert.equal(salesDotsLabel(sales), "5 sales from Nov 2 to Nov 6, $910.00 to $1,100.00");
    assert.equal(salesDotsLabel([sale(5000, "03"), sale(5000, "03"), sale(5000, "03")]), "3 sales on Nov 3, $50.00 each");
  });
});
