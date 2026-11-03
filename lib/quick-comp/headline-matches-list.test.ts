import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { middleFifty } from "@/lib/comps/stats";
import type { CompListing } from "@/lib/types";
import type { QuickCompPayload } from "./lookup";
import { quickCompRecentKey, readRecentComps, savedPayload, type RecentComp } from "./recent";
import { quickCompStats } from "./stats";

function sale(n: number, price: number, grade = "PSA 10"): CompListing {
  const day = String(28 - (n % 28)).padStart(2, "0");
  const month = 10 - Math.floor(n / 28);
  return {
    id: `c${n}`,
    itemId: `i${n}`,
    title: `Fixture sale ${n}`,
    soldPrice: price,
    soldDate: `2026-${String(month).padStart(2, "0")}-${day}`,
    platform: "eBay",
    condition: grade,
    shipping: null,
    url: `https://example.test/${n}`,
  };
}

/** Newest first, priced over every sale, the way payloadFromSales builds it. */
function serverPayload(comps: CompListing[], extra: Partial<QuickCompPayload> = {}): QuickCompPayload {
  const stats = middleFifty(comps.map((comp) => comp.soldPrice));
  return {
    comps,
    history: [],
    median: stats.median,
    p25: stats.p25,
    p75: stats.p75,
    count: comps.length,
    source: "trawl",
    cached: false,
    fetchedAt: "2026-11-03T15:00:00.000Z",
    query: "q",
    lowConfidence: comps.length > 0 && comps.length < 5,
    sample: false,
    ...extra,
  };
}

// LeBron shape: a rising card. The newest 30 climb to $15k, the 14 older sit near $7–9k.
const lebron = Array.from({ length: 44 }, (_, n) =>
  n < 30 ? sale(n, 15_000 - n * 190 + 0.5) : sale(n, 7_000 + ((n * 311) % 2_000) + 0.25),
);
// PSA 9 shape: 36 sales, the 6 older ones cheaper.
const psa9 = Array.from({ length: 36 }, (_, n) =>
  n < 30 ? sale(n, 4_400 + ((n * 97) % 600) + 0.04, "PSA 9") : sale(n, 3_200 + n * 10, "PSA 9"),
);
const luka = Array.from({ length: 12 }, (_, n) => sale(n, 190 + ((n * 7) % 21)));

function expectListed(payload: QuickCompPayload) {
  const saved = savedPayload(payload);
  const kept = payload.comps.slice(0, 30);
  assert.deepEqual(saved.comps, kept);
  assert.equal(saved.count, 30);
  const listed = middleFifty(kept.map((comp) => comp.soldPrice));
  assert.equal(saved.median, listed.median);
  assert.equal(saved.p25, listed.p25);
  assert.equal(saved.p75, listed.p75);
  assert.notEqual(saved.median, payload.median);
  const stats = quickCompStats(saved.comps)!;
  assert.ok(saved.median! >= stats.low && saved.median! <= stats.high);
  return saved;
}

describe("the headline is priced from the listed sales", () => {
  it("LeBron shape: 44 sales, the headline is the median of the newest 30", () => {
    const payload = serverPayload(lebron);
    assert.ok(payload.median! > 10_000 && payload.median! < 11_000, `stale all-sales median ${payload.median}`);
    const saved = expectListed(payload);
    assert.ok(saved.median! > 12_000, `listed median ${saved.median}`);
  });

  it("PSA 9 shape: 36 sales, older ones cheaper", () => {
    const saved = expectListed(serverPayload(psa9));
    assert.ok(saved.median! > 4_400);
  });

  it("Luka shape: 12 sales, nothing changes", () => {
    const payload = serverPayload(luka);
    const saved = savedPayload(payload);
    assert.equal(saved.median, payload.median);
    assert.equal(saved.p25, payload.p25);
    assert.equal(saved.p75, payload.p75);
    assert.equal(saved.count, payload.count);
    assert.equal(saved.comps.length, 12);
  });

  it("re-prices a v1 row saved before this change, photo untouched", () => {
    const stale = serverPayload(lebron);
    const row: RecentComp = {
      key: "k1",
      identity: {
        playerName: "Fixture Player",
        year: 2003,
        yearLabel: "2003-04",
        setBrand: "Topps Chrome",
        cardNumber: "111",
        parallel: "Base",
        grade: "PSA 10",
      },
      catalog: null,
      // As saved before: 30 comps, the all-sales median and count, no photo key.
      payload: {
        median: stale.median,
        p25: stale.p25,
        p75: stale.p75,
        count: 44,
        source: "trawl",
        fetchedAt: stale.fetchedAt,
        lowConfidence: false,
        sample: false,
        comps: lebron.slice(0, 30),
      },
      savedAt: "2026-11-03T10:00:00.000Z",
    };
    const data = new Map<string, string>([[quickCompRecentKey("u1"), JSON.stringify([row])]]);
    const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
    const [read] = readRecentComps(store, "u1");
    const listed = middleFifty(lebron.slice(0, 30).map((comp) => comp.soldPrice));
    assert.equal(read.payload.median, listed.median);
    assert.equal(read.payload.p25, listed.p25);
    assert.equal(read.payload.p75, listed.p75);
    assert.equal(read.payload.count, 30);
    assert.equal(read.payload.comps.length, 30);
    assert.equal("photo" in read.payload, false);
    assert.equal(read.payload.photo, undefined);
  });

  it("edges: no sales, one sale, low confidence passes through", () => {
    const none = savedPayload(serverPayload([], { median: 10, p25: 10, p75: 10, count: 3 }));
    assert.equal(none.median, null);
    assert.equal(none.p25, null);
    assert.equal(none.p75, null);
    assert.equal(none.count, 0);

    const one = savedPayload(serverPayload([sale(0, 123.45)], { median: 99 }));
    assert.equal(one.median, 123.45);
    assert.equal(one.count, 1);

    assert.equal(savedPayload(serverPayload(luka, { lowConfidence: true })).lowConfidence, true);
    assert.equal(savedPayload(serverPayload(luka.slice(0, 3), { lowConfidence: false })).lowConfidence, false);
  });
});
