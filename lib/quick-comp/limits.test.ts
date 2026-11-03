import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  allowsAfterLostWrite,
  consumeBucketWithStore,
  type BucketRow,
  type BucketStore,
} from "@/lib/comps/rate-limit-loop";
import { getQuickComp, type QuickCompDeps } from "./lookup";
import type { CacheFn } from "./cache";
import type { QuickCompIdentity } from "./identity";
import {
  QUICK_COMP_DAILY_LIMIT,
  QUICK_COMP_DAY_BUCKET,
  QUICK_COMP_DAY_MS,
  spendQuickCompLookup,
  windowResetAt,
} from "./limits";

const row: BucketRow = {
  table: "comps_rate_limits",
  subjectColumn: "user_id",
  subject: "fixture-user",
  bucket: QUICK_COMP_DAY_BUCKET,
  windowStart: "2026-11-03T00:00:00.000Z",
};

function memoryStore(): BucketStore {
  let count: number | null = null;
  return {
    async read() {
      return { count };
    },
    async insert(_row, next) {
      count = next;
      return { ok: true };
    },
    async update(_row, _from, to) {
      count = to;
      return { ok: true };
    },
  };
}

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

function trawlDeps(spent: { daily: number; hourly: number; fetches: number }): Partial<QuickCompDeps> {
  return {
    source: () => "trawl",
    hasTrawlKey: () => true,
    cache: memoryCache(),
    limits: {
      consumeDaily: async () => (spent.daily++, spent.daily <= QUICK_COMP_DAILY_LIMIT),
      consumeHourly: async () => (spent.hourly++, true),
    },
    fetchSold: async () => {
      spent.fetches++;
      return {
        ok: true,
        rateLimitRemaining: null,
        body: { site: "EBAY_US", currency: "USD", query: [], count: 0, credits_charged: 0, results: [] },
      };
    },
  };
}

describe("quick comp daily cap", () => {
  it("allows 10 lookups a day and blocks the 11th", async () => {
    const store = memoryStore();
    const results: boolean[] = [];
    for (let i = 0; i < QUICK_COMP_DAILY_LIMIT + 1; i++) {
      results.push(await consumeBucketWithStore(store, row, QUICK_COMP_DAILY_LIMIT));
    }
    assert.equal(QUICK_COMP_DAILY_LIMIT, 10);
    assert.deepEqual(results, [...Array(10).fill(true), false]);
  });

  it("uses a 24h window, so it resets at UTC midnight", () => {
    assert.equal(QUICK_COMP_DAY_MS, 86_400_000);
    assert.equal(windowResetAt(QUICK_COMP_DAY_MS, Date.parse("2026-11-03T15:20:00Z")), "2026-11-04T00:00:00.000Z");
  });

  it("fails closed after a lost write", async () => {
    assert.equal(allowsAfterLostWrite(QUICK_COMP_DAY_BUCKET), false);
    // The card page's other buckets are unchanged.
    assert.equal(allowsAfterLostWrite("trawl"), false);
    assert.equal(allowsAfterLostWrite("want_match"), false);
    assert.equal(allowsAfterLostWrite("requests"), true);
    const conflicting: BucketStore = {
      async read() {
        return { count: 3 };
      },
      async insert() {
        return { ok: false, conflict: true };
      },
      async update() {
        return { ok: false, conflict: true };
      },
    };
    const allowed = await consumeBucketWithStore(conflicting, row, QUICK_COMP_DAILY_LIMIT, {
      sleep: async () => {},
      attempts: 3,
    });
    assert.equal(allowed, false);
  });

  it("still applies the hourly Trawl cap after the daily one", async () => {
    const order: string[] = [];
    const result = await spendQuickCompLookup("fixture-user", {
      consumeDaily: async () => (order.push("daily"), true),
      consumeHourly: async () => (order.push("hourly"), false),
      now: () => Date.parse("2026-11-03T15:20:00Z"),
    });
    assert.deepEqual(order, ["daily", "hourly"]);
    assert.deepEqual(result, { ok: false, reason: "hourly", resetAt: "2026-11-03T16:00:00.000Z" });
  });

  it("reports the daily cap with the next UTC midnight", async () => {
    let hourly = 0;
    const result = await spendQuickCompLookup("fixture-user", {
      consumeDaily: async () => false,
      consumeHourly: async () => (hourly++, true),
      now: () => Date.parse("2026-11-03T15:20:00Z"),
    });
    assert.equal(hourly, 0);
    assert.deepEqual(result, { ok: false, reason: "daily", resetAt: "2026-11-04T00:00:00.000Z" });
  });

  it("never spends the cap on a cache hit", async () => {
    const spent = { daily: 0, hourly: 0, fetches: 0 };
    const deps = trawlDeps(spent);
    for (let i = 0; i < 5; i++) {
      const result = await getQuickComp(identity, "fixture-user", deps);
      assert.equal(result.ok, true);
    }
    assert.deepEqual(spent, { daily: 1, hourly: 1, fetches: 1 });
  });

  it("never spends the cap or calls Trawl in sample or off mode", async () => {
    for (const source of ["sample", "off"] as const) {
      const spent = { daily: 0, hourly: 0, fetches: 0 };
      const result = await getQuickComp(identity, "fixture-user", { ...trawlDeps(spent), source: () => source });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.payload.sample, true);
      assert.deepEqual(spent, { daily: 0, hourly: 0, fetches: 0 }, source);
    }
  });

  it("returns 429 shapes from the lookup, with no Trawl call", async () => {
    let fetches = 0;
    const result = await getQuickComp(identity, "fixture-user", {
      ...trawlDeps({ daily: 0, hourly: 0, fetches: 0 }),
      limits: { consumeDaily: async () => false, consumeHourly: async () => true },
      fetchSold: async () => {
        fetches++;
        throw new Error("unreachable");
      },
      now: () => Date.parse("2026-11-03T15:20:00Z"),
    });
    assert.deepEqual(result, { ok: false, reason: "daily", resetAt: "2026-11-04T00:00:00.000Z" });
    assert.equal(fetches, 0);
  });

  it("wires the daily bucket and the shared hourly Trawl bucket", () => {
    const source = readFileSync(join(process.cwd(), "lib/quick-comp/limits-server.ts"), "utf8");
    assert.match(source, /consumeRateLimit\(userId, QUICK_COMP_DAY_BUCKET, QUICK_COMP_DAY_MS, QUICK_COMP_DAILY_LIMIT\)/);
    assert.match(source, /consumeHourly: consumeTrawlLimit/);
  });
});
