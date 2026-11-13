import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScanMatch } from "./match";
import {
  COMP_COPY,
  compIdentityFromMatch,
  compQueryString,
  scanCompGrade,
  summarizeSales,
  trendOf,
} from "./comp";

/** Made-up sales and matches. Not real listings. */
function match(partial: Partial<ScanMatch> = {}): ScanMatch {
  return {
    catalogId: "wemby-prizm",
    playerName: "Victor Wembanyama",
    sport: "Basketball",
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "Silver",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: null,
    score: 100,
    sureness: { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "sure" },
    parallelOptions: [],
    ...partial,
  };
}

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T12:00:00Z`;

describe("scanCompGrade", () => {
  it("uses the slab's grade, and Raw for a raw card", () => {
    const grade = { company: "PSA", number: "10", qualifier: "", certNumber: "1", authentic: false, autoGrade: "" };
    assert.equal(scanCompGrade(match({ grade })), "PSA 10");
    assert.equal(scanCompGrade(match({ grade: { ...grade, number: "9.5", company: "BGS" } })), "BGS 9.5");
    assert.equal(scanCompGrade(match()), "Raw");
    assert.equal(scanCompGrade(match({ grade: { ...grade, number: "", authentic: true } })), "Raw");
  });
});

describe("compIdentityFromMatch", () => {
  it("builds the quick comp identity for the picked grade", () => {
    assert.deepEqual(compIdentityFromMatch(match(), "PSA 10"), {
      identity: {
        playerName: "Victor Wembanyama",
        year: 2023,
        yearLabel: "2023-24",
        setBrand: "Panini Prizm",
        cardNumber: "136",
        parallel: "Silver",
        grade: "PSA 10",
      },
      assumedBase: false,
    });
  });

  it("prices Base when the parallel is open, and says so", () => {
    const result = compIdentityFromMatch(match({ parallel: "" }), "Raw");
    assert.equal(result?.identity.parallel, "Base");
    assert.equal(result?.assumedBase, true);
  });

  it("needs a player and a year", () => {
    assert.equal(compIdentityFromMatch(match({ playerName: "" }), "Raw"), null);
    assert.equal(compIdentityFromMatch(match({ yearLabel: "" }), "Raw"), null);
  });

  it("writes the lookup query with the quick comp field names", () => {
    const identity = compIdentityFromMatch(match(), "PSA 10")!.identity;
    assert.equal(
      compQueryString(identity),
      "player=Victor+Wembanyama&year=2023-24&set=Panini+Prizm&number=136&parallel=Silver&grade=PSA+10",
    );
  });
});

describe("summarizeSales", () => {
  it("gives a value, range and newest-first sales when there are enough", () => {
    const result = summarizeSales(
      [
        { price: 40, soldAt: day(1) },
        { price: 50, soldAt: day(9) },
        { price: 45, soldAt: day(5) },
        { price: 60, soldAt: day(12) },
      ],
      { asOf: day(13), source: "quick-comp" },
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.nSales, 4);
    assert.equal(result.medianCents, 4750);
    assert.deepEqual(
      result.sales.map((sale) => sale.priceCents),
      [6000, 5000, 4500, 4000],
    );
    assert.ok(result.lowCents != null && result.highCents != null && result.lowCents <= result.highCents);
    assert.equal(result.trend, "up");
    assert.equal(result.source, "quick-comp");
  });

  it("shows the sales but no value under 3 sales", () => {
    const result = summarizeSales([{ price: 40, soldAt: day(1) }, { price: 44, soldAt: day(2) }], {
      asOf: null,
      source: "collections",
    });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.medianCents, null);
    assert.equal(result.lowCents, null);
    assert.equal(result.sales.length, 2);
    assert.equal(result.trend, null);
  });

  it("is none with no usable sales, never a made-up price", () => {
    assert.deepEqual(summarizeSales([], { asOf: null, source: "collections" }), { status: "none" });
    assert.deepEqual(summarizeSales([{ price: 0, soldAt: day(1) }, { price: Number.NaN, soldAt: null }], { asOf: null, source: "collections" }), {
      status: "none",
    });
  });

  it("keeps at most 10 sales", () => {
    const sales = Array.from({ length: 30 }, (_, i) => ({ price: 40 + (i % 5), soldAt: day((i % 28) + 1) }));
    const result = summarizeSales(sales, { asOf: null, source: "collections" });
    assert.ok(result.status === "ok" && result.sales.length === 10 && result.nSales === 30);
  });
});

describe("trendOf", () => {
  it("compares the newer half of sales with the older half", () => {
    assert.equal(trendOf([{ priceCents: 1000, soldAt: day(1) }, { priceCents: 1000, soldAt: day(2) }, { priceCents: 1500, soldAt: day(3) }, { priceCents: 1500, soldAt: day(4) }]), "up");
    assert.equal(trendOf([{ priceCents: 1500, soldAt: day(1) }, { priceCents: 1500, soldAt: day(2) }, { priceCents: 1000, soldAt: day(3) }, { priceCents: 1000, soldAt: day(4) }]), "down");
    assert.equal(trendOf([{ priceCents: 1000, soldAt: day(1) }, { priceCents: 1010, soldAt: day(2) }, { priceCents: 1000, soldAt: day(3) }, { priceCents: 1020, soldAt: day(4) }]), "flat");
  });

  it("has no trend under 4 dated sales", () => {
    assert.equal(trendOf([{ priceCents: 1000, soldAt: day(1) }, { priceCents: 2000, soldAt: day(2) }, { priceCents: 3000, soldAt: null }]), null);
  });
});

describe("copy", () => {
  it("is honest and plain", () => {
    for (const text of Object.values(COMP_COPY)) {
      assert.equal(/!/.test(text), false, text);
      assert.equal(/\bfree\b/i.test(text), false, text);
      // Recent sold prices or via Trawl, never "eBay data".
      assert.equal(/ebay data/i.test(text), false, text);
      // Nobody has to add the card to see a price.
      assert.equal(/add it to your collection|we'll price it/i.test(text), false, text);
    }
    assert.match(COMP_COPY.none, /No recent sales/);
    assert.match(COMP_COPY.noneSearched, /^No sales yet$/);
  });
});
