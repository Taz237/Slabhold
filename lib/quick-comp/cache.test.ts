import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadSharedQuickComp,
  QUICK_COMP_CACHE_TAG,
  QUICK_COMP_REVALIDATE_SECONDS,
  QuickCompFailure,
  quickCompCacheKey,
  type CacheFn,
} from "./cache";
import type { QuickCompIdentity } from "./identity";

const base: QuickCompIdentity = {
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023",
  setBrand: "Prizm",
  cardNumber: "12",
  parallel: "Base",
  grade: "PSA 10",
};

/** unstable_cache's contract: a value is stored, a throw is not. */
function memoryCache() {
  const store = new Map<string, unknown>();
  const seen: { keyParts: string[]; options: { tags: string[]; revalidate: number } }[] = [];
  const cache: CacheFn = (load, keyParts, options) => async () => {
    seen.push({ keyParts, options });
    const key = keyParts.join("|");
    if (store.has(key)) return store.get(key) as Awaited<ReturnType<typeof load>>;
    const value = await load();
    store.set(key, value);
    return value;
  };
  return { cache, store, seen };
}

describe("quick comp shared cache", () => {
  it("loads the same identity once", async () => {
    const { cache, seen } = memoryCache();
    let loads = 0;
    const load = async () => ({ median: 40, n: ++loads });
    const first = await loadSharedQuickComp(base, load, cache);
    const second = await loadSharedQuickComp({ ...base, playerName: " fixture  player " }, load, cache);
    assert.equal(loads, 1);
    assert.deepEqual(second, first);
    assert.deepEqual(seen[0].options, { tags: [QUICK_COMP_CACHE_TAG], revalidate: QUICK_COMP_REVALIDATE_SECONDS });
    assert.equal(QUICK_COMP_REVALIDATE_SECONDS, 6 * 60 * 60);
  });

  it("gives another grade or parallel a new key", () => {
    const key = quickCompCacheKey(base);
    assert.match(key, /^quick-comp-v1\|/);
    assert.notEqual(quickCompCacheKey({ ...base, grade: "PSA 9" }), key);
    assert.notEqual(quickCompCacheKey({ ...base, grade: "Raw" }), key);
    assert.notEqual(quickCompCacheKey({ ...base, parallel: "Silver" }), key);
    assert.notEqual(quickCompCacheKey({ ...base, cardNumber: "13" }), key);
  });

  it("has no user id in the key", async () => {
    const { cache, seen } = memoryCache();
    await loadSharedQuickComp(base, async () => 1, cache);
    assert.deepEqual(seen[0].keyParts, [quickCompCacheKey(base)]);
    assert.doesNotMatch(seen[0].keyParts.join("|"), /fixture-user|user/);
  });

  it("never stores a rate limit or an unavailable lookup", async () => {
    const { cache, store } = memoryCache();
    for (const failure of [
      new QuickCompFailure("daily", "2026-11-04T00:00:00.000Z"),
      new QuickCompFailure("hourly", "2026-11-03T16:00:00.000Z"),
      new QuickCompFailure("unavailable"),
    ]) {
      await assert.rejects(
        loadSharedQuickComp(base, async () => {
          throw failure;
        }, cache),
        failure,
      );
      assert.equal(store.size, 0);
    }
    let loads = 0;
    await loadSharedQuickComp(base, async () => ++loads, cache);
    assert.equal(loads, 1);
    assert.equal(store.size, 1);
  });
});
