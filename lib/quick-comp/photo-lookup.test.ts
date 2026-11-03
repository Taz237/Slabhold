import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { fetchTrawlSold } from "@/lib/comps/trawl";
import type { TrawlSoldResult } from "@/lib/comps/types";
import type { CacheFn } from "./cache";
import type { QuickCompIdentity } from "./identity";
import { getQuickComp, type QuickCompDeps } from "./lookup";
import { SAMPLE_PHOTO_URL } from "./photo";

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

const sharp = "https://i.ebayimg.com/images/g/fixture1/s-l1600.webp";
const small = "https://i.ebayimg.com/images/g/fixture1/s-l500.webp";

function fixtureResult(): TrawlSoldResult {
  return {
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
    image_url: small,
    details: {
      grading: { graded: true, grader: "PSA", grade: "10", condition: null },
      images: [sharp, "https://i.ebayimg.com/images/g/fixture1b/s-l1600.webp"],
    },
  };
}

const realFetch = globalThis.fetch;
let network: string[] = [];

beforeEach(() => {
  network = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    network.push(String(input));
    throw new Error("no network in tests");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetchSold() {
  const calls: Array<{ query: string; opts: unknown }> = [];
  const fetchSold = (async (query: string, opts: unknown) => {
    calls.push({ query, opts });
    return {
      ok: true,
      status: 200,
      body: { site: "EBAY_US", currency: "USD", query: [], count: 1, credits_charged: 2, results: [fixtureResult()] },
      rateLimitRemaining: null,
    };
  }) as unknown as typeof fetchTrawlSold;
  return { fetchSold, calls };
}

describe("getQuickComp photo", () => {
  it("picks the photo from the results already fetched, with one Trawl call", async () => {
    const fake = fakeFetchSold();
    const cache = memoryCache();
    const deps: Partial<QuickCompDeps> = {
      source: () => "trawl",
      hasTrawlKey: () => true,
      limits: openLimits,
      cache,
      fetchSold: fake.fetchSold,
    };
    const first = await getQuickComp(identity, "fixture-user", deps);
    assert.equal(first.ok, true);
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(fake.calls[0].opts, { days: 90, maxPages: 1 });
    if (!first.ok) return;
    assert.deepEqual(first.payload.photo, { url: sharp, itemId: "fixture-1", soldAt: first.payload.photo?.soldAt });
    assert.ok(first.payload.photo?.soldAt);

    const second = await getQuickComp(identity, "fixture-user", deps);
    assert.equal(fake.calls.length, 1, "a hit spends no Trawl call");
    assert.ok(second.ok);
    if (second.ok) assert.deepEqual(second.payload.photo, first.payload.photo);
    assert.equal(network.length, 0);
  });

  it("serves the sample photo with zero network calls", async () => {
    const fake = fakeFetchSold();
    const result = await getQuickComp(identity, "fixture-user", {
      source: () => "sample",
      limits: openLimits,
      cache: memoryCache(),
      fetchSold: fake.fetchSold,
    });
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.payload.photo?.url, SAMPLE_PHOTO_URL);
      assert.equal(result.payload.photo?.itemId, "sample");
      const newest = result.payload.comps.map((comp) => comp.soldDate).sort().at(-1);
      assert.equal(result.payload.photo?.soldAt, newest);
    }
    assert.equal(fake.calls.length, 0);
    assert.equal(network.length, 0);
  });
});
