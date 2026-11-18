import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lastSoldLine, SalesChart, saleMeta } from "@/components/sales-chart";
import { saleDate } from "@/components/comp-basis";
import { addDays } from "@/lib/chart/range";
import { headlineRange, latestSale, type ChartSale } from "@/lib/chart/sales";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { valueFromShownSales } from "@/lib/comps/shared-value";
import type { CompListing } from "@/lib/types";

// 1990 Skybox Michael Jordan #41 PSA 6: 46 sales, median $16.38, middle half
// $14.99 to $19.99, and the newest sale is $24.50.
const PRICES = [
  12.0, 12.5, 12.99, 13.25, 13.5, 13.75, 13.99, 14.0, 14.25, 14.5, 14.75,
  14.99, 14.99,
  15.0, 15.25, 15.5, 15.5, 15.75, 15.99, 16.0, 16.0, 16.2,
  16.25, 16.51,
  16.75, 17.0, 17.25, 17.5, 17.99, 18.25, 18.5, 19.0, 19.5,
  19.99, 19.99,
  20.0, 20.5, 21.0, 21.5, 21.99, 22.0, 22.5, 23.0, 23.5, 24.0, 24.5,
];
const LAST = 24.5;
const today = snapshotDateInNewYork();
const lastDate = addDays(today, -1);

const sales: ChartSale[] = PRICES.map((price, index) => ({
  id: `mj-${index}`,
  price,
  // The $24.50 sale is the newest. Every other sale is older.
  date: price === LAST ? lastDate : addDays(today, -(2 + index)),
  grade: "PSA 6",
  source: "eBay",
}));

const comps = sales.map((sale) => ({
  id: sale.id,
  itemId: sale.id,
  title: "1990 Skybox Michael Jordan #41 PSA 6",
  soldPrice: sale.price,
  soldDate: sale.date,
  condition: "PSA 6",
  platform: "eBay",
  url: "https://example.com",
})) as unknown as CompListing[];

const card = { id: "fixture-mj-41", estimatedSellPrice: 0, purchasePrice: 0 };

function chart(props: Record<string, unknown> = {}) {
  const value = valueFromShownSales(comps);
  return renderToStaticMarkup(
    createElement(SalesChart, {
      card,
      sales,
      source: "trawl",
      sample: false,
      lockedToComps: true,
      median: value.median,
      p25: value.low,
      p75: value.high,
      count: value.nSales,
      heading: "Estimated value",
      ...props,
    } as Parameters<typeof SalesChart>[0]),
  );
}

function hero(html: string): string {
  return html.match(/data-comp-value=""[^>]*>([^<]+)</)?.[1] ?? "";
}

describe("Estimated value: the headline sits inside its Low/High bar", () => {
  it("prices the 46 sales at median $16.38, Low $14.99, High $19.99", () => {
    const value = valueFromShownSales(comps);
    assert.equal(value.nSales, 46);
    assert.equal(value.median, 16.38);
    assert.equal(value.low, 14.99);
    assert.equal(value.high, 19.99);
  });

  it("headlines the median, not the $24.50 last sale, and the bar holds it", () => {
    const html = chart();
    assert.equal(hero(html), "$16.38");
    assert.match(html, /Low \$14\.99/);
    assert.match(html, /High \$19\.99/);
    const low = Number(html.match(/Low \$([\d.]+)/)?.[1]);
    const high = Number(html.match(/High \$([\d.]+)/)?.[1]);
    assert.ok(low <= 16.38 && 16.38 <= high, `${low} to ${high} leaves out $16.38`);
  });

  it("keeps the last sale as its own small line", () => {
    const line = lastSoldLine(latestSale(sales)!, today);
    assert.equal(line, `Last sold $24.50 · ${saleDate(lastDate, today)}`);
    const html = chart();
    assert.equal(html.split(line).length - 1, 1);
    assert.match(html, /data-last-sold=""/);
  });

  it("keeps the median headline while a sale is tapped; the small line shows that sale", () => {
    const html = chart({ selectedSaleId: "mj-45" });
    assert.equal(hero(html), "$16.38");
    assert.match(html, /Low \$14\.99/);
    assert.ok(html.includes(`Sold $24.50 · ${saleMeta(sales[45], today)}`));
  });

  it("widens the bar when a passed-in median falls outside it", () => {
    assert.deepEqual(headlineRange(24.5, 14.99, 19.99), { value: 24.5, low: 14.99, high: 24.5 });
    assert.deepEqual(headlineRange(12, 14.99, 19.99), { value: 12, low: 12, high: 19.99 });
    assert.deepEqual(headlineRange(16.38, 14.99, 19.99), { value: 16.38, low: 14.99, high: 19.99 });
    assert.equal(headlineRange(null, 14.99, 19.99), null);
    const html = chart({ median: 24.5 });
    assert.equal(hero(html), "$24.50");
    assert.match(html, /High \$24\.50/);
  });

  it("finds the newest sale by date", () => {
    assert.equal(latestSale(sales)?.price, 24.5);
    assert.equal(latestSale([]), null);
  });

  it("adds no last-sold line when the headline is already a fallback", () => {
    const html = chart({ headlineIsEstimate: false, headlineLabel: "Last sold $24.50 on Nov 13" });
    assert.doesNotMatch(html, /data-last-sold=""/);
  });
});
