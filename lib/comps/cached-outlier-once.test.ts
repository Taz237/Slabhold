import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { installFakeCompsBackend, trawlRow, type FakeCompsBackend } from "@/lib/test/fake-comps-backend";
import { cachedCompValue, sharedCompValue } from "./shared-value";
import { filterPriceOutliers } from "./stats";
import type { SoldCompCard } from "./types";

const TITLE = "2023-24 Panini Prizm Victor Wembanyama #136";

const card: SoldCompCard = {
  id: "fixture-card-outliers",
  playerName: "Victor Wembanyama",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  conditionType: "raw",
  grade: "Raw",
};

/**
 * One pass: median $240, floor $96, so $10 and $20 go and $100 stays.
 * A second pass on those 7 rows: median $260, floor $104, so $100 goes too.
 */
const PRICES = [10, 20, 100, 240, 250, 260, 270, 280, 290];

let backend: FakeCompsBackend;

before(() => {
  backend = installFakeCompsBackend();
  backend.trawlResults = PRICES.map((price, index) => trawlRow(`item-${index}`, TITLE, price, index + 1));
});

after(() => backend.restore());

describe("outlier filter runs once", () => {
  it("the fixture really changes on a second pass", () => {
    const once = filterPriceOutliers(PRICES.map((price) => ({ price })));
    const twice = filterPriceOutliers(once);
    assert.notDeepEqual(
      twice.map((sale) => sale.price),
      once.map((sale) => sale.price),
    );
  });

  it("pricing cached rows matches the fresh price, not a double-filtered one", () => {
    const fresh = sharedCompValue(card, backend.trawlResults);
    const fromCache = cachedCompValue(card, fresh.sales);
    assert.deepEqual(
      fromCache.sales.map((sale) => sale.price),
      fresh.sales.map((sale) => sale.price),
    );
    assert.equal(fromCache.median, fresh.median);
    const doubled = sharedCompValue(card, fresh.sales);
    assert.notEqual(doubled.median, fresh.median, "a second pass would have moved the median");
  });

  it("cached rows still drop sales that no longer match the card", () => {
    const fresh = sharedCompValue(card, backend.trawlResults);
    const otherCard = { ...fresh.sales[0], itemId: "other", title: "2020 Topps Chrome Mike Trout #1" };
    const fromCache = cachedCompValue(card, [...fresh.sales, otherCard]);
    assert.equal(fromCache.sales.some((sale) => sale.itemId === "other"), false);
    assert.equal(fromCache.median, fresh.median);
  });

  it("getSoldComps gives the same sales and median from cache as it did fresh", async () => {
    const { getSoldComps } = await import("./index");
    const fresh = await getSoldComps(card);
    assert.equal(fresh.ok, true);
    assert.equal(backend.trawlCalls, 1);
    assert.ok(fresh.ok && !fresh.payload.cached);

    const cached = await getSoldComps(card);
    assert.equal(backend.trawlCalls, 1, "second read is a cache hit");
    assert.ok(cached.ok && cached.payload.cached);
    assert.ok(fresh.ok && cached.ok);
    assert.deepEqual(
      cached.payload.comps.map((comp) => comp.soldPrice).sort((a, b) => a - b),
      fresh.payload.comps.map((comp) => comp.soldPrice).sort((a, b) => a - b),
    );
    assert.equal(cached.payload.median, fresh.payload.median);
    assert.equal(cached.payload.count, fresh.payload.count);

    const stale = await getSoldComps(card, { cacheOnly: true });
    assert.ok(stale.ok);
    assert.equal(stale.payload.median, fresh.payload.median);
  });
});
