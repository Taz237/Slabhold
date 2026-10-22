import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildQueryKey } from "@/lib/comps/query-key";
import type { SoldCompCard } from "@/lib/comps/types";
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
    assert.match(context, /exactCompQueryKeys/);
    assert.match(context, /readNewestBatches\(client, \[\.\.\.keys\], exactKeys\)/);
    const batches = source("lib/value/price-batch.ts");
    assert.match(batches, /order\("fetched_at", \{ ascending: false \}\)/);
    assert.match(batches, /\.in\("query_key", exactKeys\)/);
    assert.match(batches, /\.in\("query_key", rest\)/);
    assert.match(batches, /\.in\("query_key", cutKeys\)/);
    assert.doesNotMatch(batches, /\.eq\("query_key"/);
    assert.match(context, /\.ilike\("player", escapeIlike\(player\)\)/);
    assert.match(context, /from\("blocks"\)/);
    assert.match(context, /from\("comp_flags"\)/);
    assert.match(context, /PRICE_CONTEXT_CONCURRENCY/);
    assert.equal(context.includes(".limit(1000)"), false);
    assert.match(market, /throw new CardMarketUnavailable/);
    assert.match(market, /compsResultCacheTag/);
    assert.match(market, /loadCachedSoldCompCard/);
    assert.match(market, /refreshCardValue\(cardId, \{ \.\.\.options, card \}\)/);
    assert.match(context, /mergeExactSales\(subjectFlags/);
    assert.doesNotMatch(source("lib/comps/cache.ts"), /revalidateTag|revalidatePath|revalidateCard/);
    const sold = source("app/api/comps/sold/route.ts");
    assert.match(sold, /shouldBustCompsResult\(refreshed\.refreshedLive, refreshed\.payload\)/);
    assert.match(sold, /compsResultCacheTag\(cardId\)/);
    assert.match(sold, /after\(refreshed\.refreshSettled/);
    assert.match(source("lib/social/link-preview-load.ts"), /resolvePriceRead/);
    assert.equal(source("lib/social/link-preview-load.ts").includes("marketValueAmount"), false);
    assert.match(market, /\["card-market", identity/);
    assert.doesNotMatch(context, /return \{ ok: false/);
    assert.doesNotMatch(market, /return \{ ok: false/);
  });
});

const nodeRequire = createRequire(import.meta.url);
const serverOnlyEmpty = pathToFileURL(
  nodeRequire.resolve("server-only").replace(/index\.js$/, "empty.js"),
).href;
const stubDir = join(tmpdir(), "slabhold-price-cache");
mkdirSync(stubDir, { recursive: true });
const cacheStub = join(stubDir, "next-cache.mjs");
const loadCardStub = join(stubDir, "load-card.mjs");
const valueStub = join(stubDir, "get-card-value.mjs");
writeFileSync(
  cacheStub,
  `const store = new Map();
export function unstable_cache(fn, keyParts) {
  const key = JSON.stringify(keyParts);
  return async () => {
    if (store.has(key)) return store.get(key);
    globalThis.__slabholdUnstableCacheRuns = (globalThis.__slabholdUnstableCacheRuns ?? 0) + 1;
    const value = await fn();
    store.set(key, value);
    return value;
  };
}
export function revalidateTag() {}
export function revalidatePath() {}
`,
);
writeFileSync(
  loadCardStub,
  `export async function loadSoldCompCard(id) {
  return {
    id,
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "Base",
    conditionType: "raw",
    grade: "Raw",
  };
}
`,
);
writeFileSync(
  valueStub,
  `export async function refreshCardValue() {
  return {
    status: "ok",
    median: 40,
    low: 30,
    high: 50,
    nSales: 4,
    matchedAt: "2026-10-01T00:00:00.000Z",
    attempt: { reason: "ok", action: "saved" },
    payload: { cached: false, sample: false },
  };
}
export async function getCardValue() {
  return null;
}
`,
);

type ResolveHook = (
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (specifier: string, context: { parentURL?: string }) => { url: string },
) => { url: string; shortCircuit?: boolean };

const registerHooks = (
  nodeRequire("node:module") as { registerHooks?: (hooks: { resolve: ResolveHook }) => void }
).registerHooks;

if (!registerHooks) {
  throw new Error("node:module registerHooks is required to import server-only modules in tests");
}

const hookFlag = "__slabholdPriceCacheHook";
if (!(globalThis as Record<string, unknown>)[hookFlag]) {
  (globalThis as Record<string, unknown>)[hookFlag] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") return { url: serverOnlyEmpty, shortCircuit: true };
      if (specifier === "next/cache") return { url: pathToFileURL(cacheStub).href, shortCircuit: true };
      const parent = context.parentURL ?? "";
      if (
        parent.includes("card-market") &&
        (specifier === "@/lib/comps/load-card" || specifier.endsWith("/comps/load-card"))
      ) {
        return { url: pathToFileURL(loadCardStub).href, shortCircuit: true };
      }
      if (
        parent.includes("card-market") &&
        (specifier === "@/lib/value/getCardValue" ||
          specifier === "./getCardValue" ||
          specifier.endsWith("/getCardValue") ||
          specifier.endsWith("/value/getCardValue"))
      ) {
        return { url: pathToFileURL(valueStub).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

function cacheRuns(): number {
  return (globalThis as { __slabholdUnstableCacheRuns?: number }).__slabholdUnstableCacheRuns ?? 0;
}

describe("refreshedLive follows unstable_cache", () => {
  it("is true only when the callback runs, and false on a hit", async () => {
    const { loadCachedCardRefresh } = await import("@/lib/value/card-market");
    const cardId = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
    const first = await loadCachedCardRefresh(cardId, { save: false });
    assert.equal(first.refreshedLive, true);
    const ran = cacheRuns();
    assert.ok(ran >= 1);
    const second = await loadCachedCardRefresh(cardId, { save: false });
    assert.equal(second.refreshedLive, false);
    assert.equal(cacheRuns(), ran);
  });
});

describe("readPriceContext exact key", () => {
  it("passes the card's own query key as an exact key", async () => {
    const { readPriceContext } = await import("@/lib/value/price-context");
    const { publicCardQueryKey } = await import("@/lib/comps/public");
    const card: SoldCompCard = {
      id: "card-own",
      playerName: "J.J. McCarthy",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Donruss",
      cardNumber: "303",
      parallel: "Pink",
      conditionType: "raw",
      grade: "Raw",
    };
    const cousinRow = {
      id: "card-cousin",
      year: 2024,
      year_label: "2024",
      set: "Donruss",
      set_name: "Donruss",
      grade: "Raw",
      parallel: "Blue",
      card_number: "303",
      condition_type: "raw",
    };
    const cousin = { ...cousinRow, user_id: "user-2", player: "J.J. McCarthy" };
    const ownKey = buildQueryKey(card);
    const cousinKey = publicCardQueryKey(cousinRow);
    assert.notEqual(ownKey, cousinKey);
    const queryKeyReads: string[][] = [];
    const db = {
      from(table: string) {
        const builder = {
          select() {
            return builder;
          },
          ilike() {
            return builder;
          },
          gte() {
            return builder;
          },
          lte() {
            return builder;
          },
          eq() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          in(column: string, values: readonly string[]) {
            if (table === "sold_comps_cache" && column === "query_key") {
              queryKeyReads.push([...values]);
            }
            return builder;
          },
          then(
            resolve: (value: { data: unknown; error: null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            const data = table === "public_cards" ? [cousin] : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    };
    await readPriceContext(card, "user-1", db);
    assert.ok(
      queryKeyReads.some((keys) => keys.includes(ownKey) && !keys.includes(cousinKey)),
    );
  });
});
