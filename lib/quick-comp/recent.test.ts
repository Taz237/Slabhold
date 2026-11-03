import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHARED_RECENT_SEARCH_KEY } from "@/lib/search/recent";
import {
  QUICK_COMP_RECENT_LIMIT,
  quickCompRecentKey,
  readRecentComps,
  rememberRecentComp,
  type RecentComp,
} from "./recent";

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function entry(n: number): RecentComp {
  return {
    key: `k${n}`,
    identity: {
      playerName: `Fixture Player ${n}`,
      year: 2023,
      yearLabel: "2023",
      setBrand: "Prizm",
      cardNumber: String(n),
      parallel: "Base",
      grade: "PSA 10",
    },
    catalog: null,
    payload: {
      median: 40,
      p25: 36,
      p75: 44,
      count: 1,
      source: "sample",
      fetchedAt: null,
      lowConfidence: true,
      sample: true,
      comps: [
        {
          id: "c1",
          itemId: "i1",
          title: "Fixture sale",
          soldPrice: 40,
          soldDate: "2026-10-30",
          platform: "eBay",
          condition: "PSA 10",
          shipping: null,
          url: "https://example.test/1",
        },
      ],
    },
    savedAt: "2026-11-03T10:00:00.000Z",
  };
}

describe("recent comps on this device", () => {
  it("keeps the last 10, newest first, with no duplicates", () => {
    const store = memory();
    for (let n = 1; n <= 12; n++) rememberRecentComp(store, "u1", entry(n));
    rememberRecentComp(store, "u1", entry(8));
    const list = readRecentComps(store, "u1");
    assert.equal(QUICK_COMP_RECENT_LIMIT, 10);
    assert.equal(list.length, 10);
    assert.deepEqual(
      list.map((item) => item.key),
      ["k8", "k12", "k11", "k10", "k9", "k7", "k6", "k5", "k4", "k3"],
    );
  });

  it("keys each user apart and never touches the shared search key", () => {
    const store = memory();
    rememberRecentComp(store, "u1", entry(1));
    rememberRecentComp(store, "u2", entry(2));
    assert.equal(quickCompRecentKey("u1"), "slabhold.quickcomp.recent.v1.u1");
    assert.deepEqual(readRecentComps(store, "u1").map((item) => item.key), ["k1"]);
    assert.deepEqual(readRecentComps(store, "u2").map((item) => item.key), ["k2"]);
    assert.equal(store.map.has(SHARED_RECENT_SEARCH_KEY), false);
    assert.deepEqual([...store.map.keys()].sort(), [quickCompRecentKey("u1"), quickCompRecentKey("u2")]);
  });

  it("drops bad JSON and bad rows silently", () => {
    const store = memory();
    store.setItem(quickCompRecentKey("u1"), "{not json");
    assert.deepEqual(readRecentComps(store, "u1"), []);
    store.setItem(quickCompRecentKey("u1"), JSON.stringify({ nope: true }));
    assert.deepEqual(readRecentComps(store, "u1"), []);
    store.setItem(quickCompRecentKey("u1"), JSON.stringify([entry(1), { key: "bad" }, null, 4]));
    assert.deepEqual(readRecentComps(store, "u1").map((item) => item.key), ["k1"]);
    // A write after bad JSON starts a clean list.
    store.setItem(quickCompRecentKey("u1"), "]]");
    assert.deepEqual(rememberRecentComp(store, "u1", entry(2)).map((item) => item.key), ["k2"]);
  });

  it("works with no store or no user", () => {
    assert.deepEqual(readRecentComps(null, "u1"), []);
    assert.deepEqual(readRecentComps(memory(), null), []);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readRecentComps(blocked, "u1"), []);
    assert.equal(rememberRecentComp(blocked, "u1", entry(1)).length, 1);
  });
});
