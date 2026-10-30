import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { CardValueResult } from "./types";
import {
  CARD_VALUES_RETRY_MS,
  CARD_VALUES_TIMEOUT_MS,
  PRICE_CHECK_LIMIT_MESSAGE,
  cardValuesAfterFailure,
  loadCardValuesSession,
  resetCardValuesRateLimit,
} from "./use-card-values";

const jordan: CardValueResult = {
  status: "ok",
  median: 35,
  low: 30,
  high: 40,
  nSales: 6,
  matchedAt: "2026-10-17T00:00:00.000Z",
};

describe("useCardValues failure", { concurrency: 1 }, () => {
  it("keeps old values on 429", () => {
    const previous = new Map<string, CardValueResult>([["jordan-love", jordan]]);
    const next = cardValuesAfterFailure(previous);
    assert.equal(next, previous);
    assert.equal(next.get("jordan-love")?.median, 35);
    assert.equal(next.size, 1);
  });

  it("retries a failed read once and does not clear the map in the catch", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/value/use-card-values.ts"),
      "utf8",
    );
    assert.equal(CARD_VALUES_RETRY_MS, 2000);
    const catchAt = source.indexOf(".catch(");
    assert.ok(catchAt > 0);
    const catchBlock = source.slice(catchAt);
    assert.match(catchBlock, /cardValuesAfterFailure\(current\)/);
    assert.match(catchBlock, /CARD_VALUES_RETRY_MS/);
    assert.equal(catchBlock.includes("setValues(emptyMap)"), false);
  });

  it("a fetch that never resolves ends with loading false and error true", async () => {
    let fetches = 0;
    const previous = new Map<string, CardValueResult>([["jordan-love", jordan]]);
    const session = loadCardValuesSession({
      key: "jordan-love",
      previous,
      timeoutMs: 30,
      retryMs: 20,
      fetchImpl: (_input, init) => {
        fetches += 1;
        return new Promise((_resolve, reject) => {
          const fail = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (init?.signal?.aborted) {
            fail();
            return;
          }
          init?.signal?.addEventListener("abort", fail);
        });
      },
    });
    const result = await session.done;
    assert.equal(result.loading, false);
    assert.equal(result.error, true);
    assert.equal(result.values, previous);
    assert.equal(result.values.get("jordan-love")?.median, 35);
    assert.equal(fetches, 1);
    assert.equal(CARD_VALUES_TIMEOUT_MS, 10_000);
  });

  it("does not retry a 429", async () => {
    let fetches = 0;
    const session = loadCardValuesSession({
      key: "jordan-love",
      previous: new Map(),
      retryMs: 20,
      fetchImpl: async () => {
        fetches += 1;
        return new Response(JSON.stringify({ error: "limited" }), { status: 429 });
      },
    });
    const result = await session.done;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(fetches, 1);
    assert.equal(result.loading, false);
    assert.equal(result.error, true);
    assert.equal(result.message, PRICE_CHECK_LIMIT_MESSAGE);
  });

  it("sends Retry-After on card-value 429s and does not mention sold comps", () => {
    const route = readFileSync(join(process.cwd(), "app/api/card-values/route.ts"), "utf8");
    const wants = readFileSync(join(process.cwd(), "app/api/wants/route.ts"), "utf8");
    assert.match(route, /export const maxDuration = 15/);
    assert.match(wants, /export const maxDuration = 15/);
    assert.equal((route.match(/"Retry-After": "60"/g) ?? []).length, 1);
    const copy = readFileSync(join(process.cwd(), "lib/value/price-check-limit.ts"), "utf8");
    assert.match(copy, /export const PRICE_CHECK_LIMIT_MESSAGE =\r?\n  "Too many price checks\. Try again in a minute\."/);
    assert.match(route, /from "@\/lib\/value\/price-check-limit"/);
    assert.match(route, /error: PRICE_CHECK_LIMIT_MESSAGE/);
    assert.doesNotMatch(route, /const PRICE_CHECK_LIMIT_MESSAGE/);
    const hook = readFileSync(join(process.cwd(), "lib/value/use-card-values.ts"), "utf8");
    assert.doesNotMatch(hook, /const PRICE_CHECK_LIMIT_MESSAGE/);
    assert.equal(route.toLowerCase().includes("sold comps"), false);
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    const detail = readFileSync(join(process.cwd(), "components/card-detail.tsx"), "utf8");
    const publicCard = readFileSync(join(process.cwd(), "components/public-card-view.tsx"), "utf8");
    assert.match(feed, /\{postCardValuesMessage\}/);
    assert.match(detail, /\{errorMessage\}/);
    assert.match(detail, /soldNotice/);
    assert.match(publicCard, /\{errorMessage\}/);
    assert.match(publicCard, /soldNotice/);
    const hero = readFileSync(join(process.cwd(), "components/portfolio-hero.tsx"), "utf8");
    const invested = hero.slice(
      hero.indexOf('<Tile name="Invested">'),
      hero.indexOf('<Tile name="Profit"'),
    );
    assert.ok(invested.length > 0);
    assert.equal(invested.includes("loading="), false);
  });

  it("honors Retry-After and does not send another price check until it passes", async () => {
    resetCardValuesRateLimit();
    let fetches = 0;
    try {
      const first = loadCardValuesSession({
        key: "jordan-love",
        previous: new Map(),
        fetchImpl: async () => {
          fetches += 1;
          return new Response(JSON.stringify({ error: PRICE_CHECK_LIMIT_MESSAGE }), {
            status: 429,
            headers: { "Retry-After": "60" },
          });
        },
      });
      const limited = await first.done;
      assert.equal(limited.message, PRICE_CHECK_LIMIT_MESSAGE);
      assert.equal(limited.error, true);

      const second = loadCardValuesSession({
        key: "jordan-love",
        previous: new Map(),
        fetchImpl: async () => {
          fetches += 1;
          return new Response(JSON.stringify({ values: {} }), { status: 200 });
        },
      });
      const again = await second.done;
      assert.equal(fetches, 1);
      assert.equal(again.error, true);
      assert.equal(again.message, PRICE_CHECK_LIMIT_MESSAGE);
    } finally {
      resetCardValuesRateLimit();
    }
  });
});
