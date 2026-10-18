import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VALUE_UPDATING_WINDOW_MS } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";
import { attachmentValueLabel, collectAttachedCardIds } from "./post-card-value";

function value(
  partial: Partial<CardValueResult> & Pick<CardValueResult, "status">,
): CardValueResult {
  return {
    median: null,
    low: null,
    high: null,
    nSales: 0,
    matchedAt: null,
    ...partial,
  };
}

describe("attachmentValueLabel", () => {
  const now = Date.parse("2026-10-16T12:00:00.000Z");

  it("shows the trusted median, not an estimated sell price", () => {
    assert.match(
      attachmentValueLabel(value({ status: "ok", median: 35, nSales: 6 })),
      /\$35/,
    );
  });

  it("uses the shared status labels", () => {
    assert.equal(attachmentValueLabel(value({ status: "no_sales" })), "Not enough sales yet");
    assert.equal(
      attachmentValueLabel(value({ status: "unavailable" })),
      "Value unavailable right now",
    );
    const createdAt = new Date(now - VALUE_UPDATING_WINDOW_MS + 60_000).toISOString();
    assert.equal(attachmentValueLabel(null, { createdAt, now }), "Value updating");
    assert.equal(attachmentValueLabel(null), "Not enough sales yet");
  });
});

describe("collectAttachedCardIds", () => {
  it("dedupes card ids across the feed, including quotes", () => {
    const ids = collectAttachedCardIds([
      { card: { id: "jordan" } },
      { card: null },
      { card: { id: "jordan" } },
      { card: { id: "wemby" } },
    ]);
    assert.deepEqual(ids.sort(), ["jordan", "wemby"]);
  });
});
