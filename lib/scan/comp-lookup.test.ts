import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { lookupScanComp, type ScanCompDeps } from "./comp-lookup";
import { respondScanComp, SCAN_COMP_RATE_MESSAGE, type ScanCompRouteDeps } from "./comp-respond";

/** Made-up card and sales. */
const IDENTITY: QuickCompIdentity = {
  playerName: "Victor Wembanyama",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Silver",
  grade: "Raw",
};

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T12:00:00Z`;

function deps(overrides: Partial<ScanCompDeps> = {}): ScanCompDeps {
  return {
    quickCompCache: async () => null,
    collectionSales: async () => [],
    ...overrides,
  };
}

describe("lookupScanComp", () => {
  it("uses quick comp's cached sales first", async () => {
    let collectionCalls = 0;
    const result = await lookupScanComp(IDENTITY, "viewer", deps({
      quickCompCache: async () => ({
        comps: [
          { soldPrice: 40, soldDate: day(1) },
          { soldPrice: 42, soldDate: day(2) },
          { soldPrice: 44, soldDate: day(3) },
        ],
        fetchedAt: day(4),
      }),
      collectionSales: async () => {
        collectionCalls += 1;
        return [];
      },
    }));
    assert.equal(result.status, "ok");
    assert.ok(result.status === "ok" && result.source === "quick-comp" && result.medianCents === 4200);
    assert.equal(collectionCalls, 0);
  });

  it("falls back to stored sales on public copies, without owner-entered prices", async () => {
    const result = await lookupScanComp(IDENTITY, "viewer", deps({
      collectionSales: async () => [
        { price: 50, soldAt: day(1) },
        { price: 52, soldAt: day(5) },
        { price: 900, soldAt: day(6), source: "owner" },
      ],
    }));
    assert.ok(result.status === "ok");
    assert.equal(result.source, "collections");
    assert.equal(result.nSales, 2);
    assert.equal(result.medianCents, null, "two sales: show them, no value");
    assert.equal(result.asOf, day(6));
  });

  it("never shows sample sales as real ones", async () => {
    const result = await lookupScanComp(IDENTITY, "viewer", deps({
      quickCompCache: async () => ({ comps: [{ soldPrice: 40, soldDate: day(1) }], fetchedAt: null, sample: true }),
    }));
    assert.deepEqual(result, { status: "none" });
  });

  it("says none when no cache has sales, and unavailable when both reads fail", async () => {
    assert.deepEqual(await lookupScanComp(IDENTITY, "viewer", deps()), { status: "none" });
    const failing = deps({
      quickCompCache: async () => {
        throw new Error("down");
      },
      collectionSales: async () => {
        throw new Error("down");
      },
    });
    assert.deepEqual(await lookupScanComp(IDENTITY, "viewer", failing), { status: "unavailable" });
  });
});

describe("lookupScanComp: cached eBay sold listings", () => {
  const DART: QuickCompIdentity = {
    playerName: "Jaxson Dart",
    year: 2025,
    yearLabel: "2025",
    setBrand: "Panini Mosaic",
    cardNumber: "362",
    parallel: "Orange",
    grade: "Raw",
  };
  const TITLES = [
    { title: "Jaxson Dart /199 Rookie 2025 Panini Mosaic - Orange Prizm #362 RC Giants", price: 45, soldAt: "2026-08-05" },
    { title: "2025 Panini Mosaic Jaxson Dart Orange 88/199 #362 Rookie", price: 52, soldAt: "2026-08-20" },
    { title: "2025 Panini Mosaic Jaxson Dart Orange /199 #362 PSA 10", price: 140, soldAt: "2026-08-21" },
    { title: "2025 Panini Prizm Jaxson Dart Orange /199 #332", price: 60, soldAt: "2026-08-22" },
    { title: "2025 Panini Mosaic Jaxson Dart Blue /99 #362", price: 70, soldAt: "2026-08-23" },
  ];

  it("shows the last raw sales of this exact card, with its print run", async () => {
    const result = await lookupScanComp(DART, "viewer", deps({ soldCache: async () => TITLES }), { serialRun: 199 });
    assert.equal(result.status, "ok");
    assert.ok(result.status === "ok");
    assert.equal(result.source, "sold-cache");
    // The graded sale, the Prizm card and the /99 Blue are other cards.
    assert.deepEqual(result.sales.map((sale) => sale.priceCents), [5200, 4500]);
    assert.equal(result.asOf, "2026-08-20");
  });

  it("without the print run, a numbered listing isn't counted", async () => {
    const result = await lookupScanComp(DART, "viewer", deps({ soldCache: async () => TITLES }));
    assert.deepEqual(result, { status: "none" });
  });

  it("says none honestly when nothing cached matches, and never invents a price", async () => {
    const result = await lookupScanComp({ ...DART, cardNumber: "999" }, "viewer", deps({ soldCache: async () => TITLES }), { serialRun: 199 });
    assert.deepEqual(result, { status: "none" });
  });

  it("is unavailable only when every cache read failed", async () => {
    const down = async () => {
      throw new Error("down");
    };
    assert.deepEqual(
      await lookupScanComp(DART, "viewer", { quickCompCache: down, collectionSales: down, soldCache: down }),
      { status: "unavailable" },
    );
    assert.deepEqual(
      await lookupScanComp(DART, "viewer", { quickCompCache: down, collectionSales: down, soldCache: async () => [] }),
      { status: "none" },
    );
  });
});

describe("lookupScanComp: the scan's own live search, again", () => {
  const DART: QuickCompIdentity = {
    playerName: "Jaxson Dart",
    year: 2025,
    yearLabel: "2025",
    setBrand: "Panini Mosaic",
    cardNumber: "362",
    parallel: "Orange",
    grade: "Raw",
  };
  const result = (title: string, price: number, date: string) => ({
    title,
    sale_price: price,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: `${date}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: `${title}-${date}`,
    item_link: "",
    image_url: null,
  });
  const LIVE = [
    result("2025 Panini Mosaic Jaxson Dart Orange /199 #362", 45, "2026-08-05"),
    result("2025 Panini Mosaic Jaxson Dart Blue /99 #362", 70, "2026-08-23"),
  ];

  it("another parallel reads the same search from the cache, filtered to it", async () => {
    const asked: string[] = [];
    const out = await lookupScanComp(
      { ...DART, parallel: "Blue" },
      "viewer",
      deps({ liveCache: async (query) => (asked.push(query), LIVE) }),
      { serialRun: 99, query: "Jaxson Dart /199" },
    );
    assert.deepEqual(asked, ["Jaxson Dart /199"]);
    assert.ok(out.status === "ok" && out.source === "live");
    assert.deepEqual(out.status === "ok" ? out.sales.map((sale) => sale.priceCents) : [], [7000]);
  });

  it("says the search found none for a parallel it covered, and skips it without a query", async () => {
    const none = await lookupScanComp({ ...DART, parallel: "Gold" }, "viewer", deps({ liveCache: async () => LIVE }), {
      serialRun: 10,
      query: "Jaxson Dart /199",
    });
    assert.deepEqual(none, { status: "none", searched: true });
    let reads = 0;
    await lookupScanComp(DART, "viewer", deps({ liveCache: async () => (reads++, LIVE) }), { serialRun: 199 });
    assert.equal(reads, 0);
  });

  it("the route passes q through and keeps it out of the card fields", async () => {
    let seen: { serialRun: number | null; query: string | null } | null = null;
    const response = await respondScanComp(
      new Request("https://slabhold.test/api/scan/comp?player=Jaxson+Dart&year=2025&set=Panini+Mosaic&number=362&parallel=Blue&grade=Raw&run=99&q=Jaxson+Dart+%2F199"),
      {
        enabled: () => true,
        userId: async () => "viewer",
        allow: async () => true,
        lookup: async (_identity, _user, options) => {
          seen = options;
          return { status: "none" };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(seen, { serialRun: 99, query: "Jaxson Dart /199" });
  });
});

describe("the server lookup never calls Trawl", () => {
  it("reads caches only and refuses a quick comp cache miss", () => {
    const source = readFileSync(join(process.cwd(), "lib/scan/comp-lookup-server.ts"), "utf8");
    assert.equal(/trawl/i.test(source.replace(/never calls Trawl/g, "")), false);
    assert.equal(/getQuickComp|spendQuickCompLookup|fetchSold/.test(source), false);
    assert.match(source, /throw new QuickCompFailure\("unavailable"\)/);
  });
});

describe("respondScanComp", () => {
  const url = "https://slabhold.test/api/scan/comp?player=Victor+Wembanyama&year=2023-24&set=Panini+Prizm&number=136&parallel=Silver&grade=Raw";

  function route(overrides: Partial<ScanCompRouteDeps> = {}) {
    const seen: QuickCompIdentity[] = [];
    const value: ScanCompRouteDeps = {
      enabled: () => true,
      userId: async () => "viewer",
      allow: async () => true,
      lookup: async (identity) => {
        seen.push(identity);
        return { status: "none" };
      },
      ...overrides,
    };
    return { value, seen };
  }

  it("is a 404 when the scanner is off", async () => {
    const response = await respondScanComp(new Request(url), route({ enabled: () => false }).value);
    assert.equal(response.status, 404);
  });

  it("needs a signed-in collector", async () => {
    const response = await respondScanComp(new Request(url), route({ userId: async () => null }).value);
    assert.equal(response.status, 401);
  });

  it("rejects bad fields before any lookup", async () => {
    const { value, seen } = route();
    const response = await respondScanComp(new Request(`${url}&evil=1`), value);
    assert.equal(response.status, 400);
    assert.equal(seen.length, 0);
  });

  it("caps quick repeat lookups", async () => {
    const { value, seen } = route({ allow: async () => false });
    const response = await respondScanComp(new Request(url), value);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, SCAN_COMP_RATE_MESSAGE);
    assert.equal(seen.length, 0);
  });

  it("passes the card's print run, and rejects a bad one", async () => {
    let run: number | null | undefined;
    const value = route({
      lookup: async (_identity, _user, options) => {
        run = options.serialRun;
        return { status: "none" };
      },
    }).value;
    assert.equal((await respondScanComp(new Request(`${url}&run=199`), value)).status, 200);
    assert.equal(run, 199);
    assert.equal((await respondScanComp(new Request(`${url}&run=abc`), value)).status, 400);
    assert.equal((await respondScanComp(new Request(`${url}&run=0`), value)).status, 400);
  });

  it("returns the lookup, private and uncached", async () => {
    const { value, seen } = route();
    const response = await respondScanComp(new Request(url), value);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "none" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(seen[0]?.parallel, "Silver");
    assert.equal(seen[0]?.grade, "Raw");
  });
});
