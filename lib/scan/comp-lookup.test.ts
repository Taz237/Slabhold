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
