import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QuickCompPayload } from "./lookup";
import { readRecentComps, rememberRecentComp, savedPayload, type RecentComp } from "./recent";

const photo = { url: "https://i.ebayimg.com/images/g/fixture/s-l1600.webp", itemId: "i1", soldAt: "2026-10-30" };

function payload(extra: Partial<QuickCompPayload> = {}): QuickCompPayload {
  return {
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
    history: [],
    median: 40,
    p25: 36,
    p75: 44,
    count: 1,
    source: "trawl",
    cached: false,
    fetchedAt: null,
    query: "q",
    lowConfidence: true,
    sample: false,
    ...extra,
  };
}

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

function entry(saved: RecentComp["payload"]): RecentComp {
  return {
    key: "k1",
    identity: {
      playerName: "Fixture Player",
      year: 2023,
      yearLabel: "2023",
      setBrand: "Prizm",
      cardNumber: "12",
      parallel: "Base",
      grade: "PSA 10",
    },
    catalog: null,
    payload: saved,
    savedAt: "2026-11-03T10:00:00.000Z",
  };
}

describe("saved comp photo", () => {
  it("keeps the photo with the saved comp, under the same v1 key", () => {
    const store = memoryStore();
    rememberRecentComp(store, "fixture-user", entry(savedPayload(payload({ photo }))));
    assert.deepEqual([...store.data.keys()], ["slabhold.quickcomp.recent.v1.fixture-user"]);
    assert.deepEqual(readRecentComps(store, "fixture-user")[0].payload.photo, photo);
  });

  it("saves a missing or unsafe photo as null", () => {
    assert.equal(savedPayload(payload()).photo, null);
    assert.equal(savedPayload(payload({ photo: { ...photo, url: "javascript:alert(1)" } })).photo, null);
    assert.equal(savedPayload(payload({ photo: { ...photo, url: "https://evil.com/a.webp" } })).photo, null);
  });

  it("still loads rows saved before the photo", () => {
    const store = memoryStore();
    const old = savedPayload(payload());
    delete old.photo;
    store.setItem("slabhold.quickcomp.recent.v1.fixture-user", JSON.stringify([entry(old)]));
    const rows = readRecentComps(store, "fixture-user");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload.photo, undefined);
  });
});
