import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { CardValueResult } from "./types";
import { CARD_VALUES_RETRY_MS, cardValuesAfterFailure } from "./use-card-values";

const jordan: CardValueResult = {
  status: "ok",
  median: 35,
  low: 30,
  high: 40,
  nSales: 6,
  matchedAt: "2026-10-17T00:00:00.000Z",
};

describe("useCardValues failure", () => {
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
});
