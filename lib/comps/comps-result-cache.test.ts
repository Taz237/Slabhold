import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  COMPS_RESULT_REVALIDATE_SECONDS,
  CompsResultError,
  compsIdentityKey,
  compsResultCacheKey,
  rememberCompsResult,
  type CompsCacheStore,
  type CompsIdentity,
} from "@/lib/comps/comps-result-cache";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function memoryStore<T>(): CompsCacheStore<T> & { data: Map<string, T> } {
  const data = new Map<string, T>();
  return {
    data,
    async read(key) {
      return data.has(key) ? data.get(key) : undefined;
    },
    async write(key, value) {
      data.set(key, value);
    },
  };
}

const CARD: CompsIdentity & { id: string } = {
  id: "card-1",
  playerName: "Mike Trout",
  year: 2023,
  yearLabel: "2023",
  setBrand: "Topps Chrome",
  cardNumber: "rc1",
  parallel: "Silver",
  grade: "PSA 10",
};

describe("comps result cache key", () => {
  it("stays inside a 30 to 60 minute window", () => {
    assert.equal(COMPS_RESULT_REVALIDATE_SECONDS, 45 * 60);
    assert.ok(COMPS_RESULT_REVALIDATE_SECONDS >= 30 * 60);
    assert.ok(COMPS_RESULT_REVALIDATE_SECONDS <= 60 * 60);
  });

  it("keys by card id plus player, year, set, number, parallel, and grade", () => {
    const identity = compsIdentityKey(CARD);
    const key = compsResultCacheKey(CARD);
    assert.equal(key, `${CARD.id}|${identity}`);
    assert.match(identity, /mike trout/);
    assert.match(identity, /2023/);
    assert.match(identity, /RC1/);
    assert.match(identity, /silver/);
    assert.match(identity, /psa 10/);
    assert.equal(identity.split("|").length, 11);

    assert.equal(compsIdentityKey(CARD), compsIdentityKey({ ...CARD, id: "card-2" }));
    assert.notEqual(
      compsResultCacheKey(CARD),
      compsResultCacheKey({ ...CARD, id: "card-2" }),
    );
    assert.notEqual(identity, compsIdentityKey({ ...CARD, parallel: "Gold" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, grade: "PSA 9" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, year: 2022, yearLabel: "2022" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, playerName: "Shohei Ohtani" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, cardNumber: "2" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, setBrand: "Panini Prizm" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, isAuto: true }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, isRelic: true }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, serialRun: 25 }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, gradeQualifier: "OC" }));
    assert.notEqual(identity, compsIdentityKey({ ...CARD, conditionType: "graded" }));
  });
});

describe("rememberCompsResult", () => {
  it("writes a successful result and does not load it again", async () => {
    const store = memoryStore<{ ok: true; price: number }>();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { ok: true as const, price: 12 };
    };
    const first = await rememberCompsResult("card-1|trout", load, store);
    const second = await rememberCompsResult("card-1|trout", load, store);
    assert.deepEqual(first, { ok: true, price: 12 });
    assert.deepEqual(second, first);
    assert.equal(calls, 1);
    assert.equal(store.data.size, 1);
  });

  it("caches an empty success and does not cache a throw, a null, or ok false", async () => {
    const empty = memoryStore<{ sales: never[] }>();
    let emptyCalls = 0;
    await rememberCompsResult("empty", async () => {
      emptyCalls += 1;
      return { sales: [] };
    }, empty);
    await rememberCompsResult("empty", async () => {
      emptyCalls += 1;
      return { sales: [] };
    }, empty);
    assert.equal(emptyCalls, 1);
    assert.equal(empty.data.size, 1);

    const thrown = memoryStore<{ ok: true }>();
    let throws = 0;
    const fail = async () => {
      throws += 1;
      throw new Error("db down");
    };
    await assert.rejects(() => rememberCompsResult("bad", fail, thrown), /db down/);
    await assert.rejects(() => rememberCompsResult("bad", fail, thrown), (err: unknown) => {
      assert.ok(err instanceof CompsResultError);
      return true;
    });
    assert.equal(throws, 2);
    assert.equal(thrown.data.size, 0);

    const denied = memoryStore<{ ok: false }>();
    let deniedCalls = 0;
    const deny = async () => {
      deniedCalls += 1;
      return { ok: false as const };
    };
    await assert.rejects(() => rememberCompsResult("deny", deny, denied), CompsResultError);
    await assert.rejects(() => rememberCompsResult("deny", deny, denied), CompsResultError);
    assert.equal(deniedCalls, 2);
    assert.equal(denied.data.size, 0);

    const missing = memoryStore<null>();
    let missingCalls = 0;
    await assert.rejects(
      () =>
        rememberCompsResult("missing", async () => {
          missingCalls += 1;
          return null;
        }, missing),
      CompsResultError,
    );
    assert.equal(missingCalls, 1);
    assert.equal(missing.data.size, 0);
  });
});

describe("server comps cache", () => {
  it("caches by the card identity key and throws so Next does not store errors", () => {
    const context = source("lib/value/price-context.ts");
    const market = source("lib/value/card-market.ts");
    for (const file of [context, market]) {
      assert.match(file, /unstable_cache/);
      assert.match(file, /compsResultCacheKey/);
      assert.match(file, /COMPS_RESULT_REVALIDATE_SECONDS/);
    }
    assert.match(context, /\["comps-result", key\]/);
    assert.match(context, /throw new CompsResultError/);
    assert.match(context, /fallbackSales/);
    assert.match(context, /order\("fetched_at", \{ ascending: false \}\)/);
    assert.match(context, /\.ilike\("player", escapeIlike\(player\)\)/);
    assert.match(context, /from\("blocks"\)/);
    assert.match(context, /from\("comp_flags"\)/);
    assert.match(context, /PRICE_CONTEXT_CONCURRENCY/);
    assert.equal(context.includes(".limit(1000)"), false);
    assert.match(market, /throw new CardMarketUnavailable/);
    assert.match(market, /compsResultCacheTag/);
    assert.match(market, /refreshCardValue\(cardId, \{ \.\.\.options, card \}\)/);
    assert.match(source("lib/comps/cache.ts"), /compsResultCacheTag\(cardId\)/);
    assert.match(source("lib/social/link-preview-load.ts"), /resolvePriceRead/);
    assert.equal(source("lib/social/link-preview-load.ts").includes("marketValueAmount"), false);
    assert.match(market, /\["card-market", identity/);
    assert.doesNotMatch(context, /return \{ ok: false/);
    assert.doesNotMatch(market, /return \{ ok: false/);
  });
});
