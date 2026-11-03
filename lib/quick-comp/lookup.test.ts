import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { CacheFn } from "./cache";
import type { QuickCompIdentity } from "./identity";
import { getQuickComp, type QuickCompDeps } from "./lookup";

const identity: QuickCompIdentity = {
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023",
  setBrand: "Prizm",
  cardNumber: "12",
  parallel: "Base",
  grade: "PSA 10",
};

function memoryCache(): CacheFn {
  const store = new Map<string, unknown>();
  return (load, keyParts) => async () => {
    const key = keyParts.join("|");
    if (store.has(key)) return store.get(key) as Awaited<ReturnType<typeof load>>;
    const value = await load();
    store.set(key, value);
    return value;
  };
}

const openLimits: QuickCompDeps["limits"] = {
  consumeDaily: async () => true,
  consumeHourly: async () => true,
};

const realFetch = globalThis.fetch;
const savedKey = process.env.TRAWL_API_KEY;
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  // A placeholder so fetchTrawlSold builds its request. The stubbed fetch never leaves the process.
  process.env.TRAWL_API_KEY = "fixture-placeholder";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return Response.json({
      site: "EBAY_US",
      currency: "USD",
      query: [],
      count: 1,
      credits_charged: 2,
      results: [
        {
          title: "2023 Prizm Fixture Player #12 PSA 10",
          sale_price: 48,
          shipping_price: 0,
          currency: "USD",
          condition: "Graded",
          condition_raw: null,
          date_sold: "2026-10-30",
          buying_format: "AUCTION",
          item_id: "fixture-1",
          item_link: "https://example.test/item/1",
          image_url: null,
          details: { grading: { graded: true, grader: "PSA", grade: "10", condition: null } },
        },
      ],
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedKey == null) delete process.env.TRAWL_API_KEY;
  else process.env.TRAWL_API_KEY = savedKey;
});

describe("getQuickComp", () => {
  it("asks Trawl once with details=1 and max_pages=1, and nothing else", async () => {
    const result = await getQuickComp(identity, "fixture-user", {
      source: () => "trawl",
      limits: openLimits,
      cache: memoryCache(),
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0]);
    assert.equal(url.host, "api.trawl.dev");
    assert.equal(url.searchParams.get("details"), "1");
    assert.equal(url.searchParams.get("max_pages"), "1");
    assert.match(url.searchParams.get("query") ?? "", /2023 Prizm Fixture Player #12 PSA 10/);
    if (result.ok) {
      assert.equal(result.payload.source, "trawl");
      assert.equal(result.payload.sample, false);
    }
  });

  it("never writes sold_comps_cache or sends want alerts", async () => {
    // Every network call is recorded: a cache write or alert would reach Supabase.
    await getQuickComp(identity, "fixture-user", { source: () => "trawl", limits: openLimits, cache: memoryCache() });
    assert.ok(calls.every((url) => new URL(url).host === "api.trawl.dev"), calls.join("\n"));
    const source = readFileSync(join(process.cwd(), "lib/quick-comp/lookup.ts"), "utf8");
    for (const banned of [/writeSoldCompsCache\(/, /notifyMatchedSales\(/, /getSoldComps\(/, /\bgetSoldComps\b[^(]*from/, /lib\/comps\/cache"/, /lib\/wants/]) {
      assert.doesNotMatch(source, banned);
    }
  });

  it("returns unavailable on a Trawl failure and does not store it", async () => {
    let fetches = 0;
    const cache = memoryCache();
    const failing: Partial<QuickCompDeps> = {
      source: () => "trawl",
      limits: openLimits,
      cache,
      fetchSold: async () => {
        fetches++;
        return { ok: false, status: 500, error: "fixture", outOfCredits: false, rateLimitRemaining: null };
      },
    };
    assert.deepEqual(await getQuickComp(identity, "fixture-user", failing), { ok: false, reason: "unavailable" });
    assert.deepEqual(await getQuickComp(identity, "fixture-user", failing), { ok: false, reason: "unavailable" });
    assert.equal(fetches, 2);
  });

  it("is unavailable with no Trawl key, before spending the cap", async () => {
    let daily = 0;
    const result = await getQuickComp(identity, "fixture-user", {
      source: () => "trawl",
      hasTrawlKey: () => false,
      limits: { consumeDaily: async () => (daily++, true), consumeHourly: async () => true },
      cache: memoryCache(),
    });
    assert.deepEqual(result, { ok: false, reason: "unavailable" });
    assert.equal(daily, 0);
    assert.equal(calls.length, 0);
  });

  it("serves the sample payload with zero network calls by default", async () => {
    const saved = process.env.COMPS_SOURCE;
    delete process.env.COMPS_SOURCE;
    try {
      const result = await getQuickComp(identity, "fixture-user", { cache: memoryCache(), limits: openLimits });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.payload.sample, true);
        assert.ok(result.payload.count > 0);
      }
      assert.equal(calls.length, 0);
    } finally {
      if (saved != null) process.env.COMPS_SOURCE = saved;
    }
  });
});
