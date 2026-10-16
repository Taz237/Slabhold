import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VALUE_UPDATING_WINDOW_MS,
  formatCardValueLabel,
} from "./format";
import type { CardValueResult } from "./types";

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

describe("formatCardValueLabel", () => {
  const now = Date.parse("2026-10-16T12:00:00.000Z");

  it("shows median for ok values", () => {
    assert.match(
      formatCardValueLabel(value({ status: "ok", median: 120, nSales: 8 })),
      /\$120/,
    );
  });

  it("shows No sales yet for no_sales", () => {
    assert.equal(
      formatCardValueLabel(value({ status: "no_sales" })),
      "No sales yet",
    );
  });

  it("shows unavailable copy for unavailable status", () => {
    assert.equal(
      formatCardValueLabel(value({ status: "unavailable", matchedAt: "2026-10-16T11:00:00.000Z" })),
      "Value unavailable right now",
    );
  });

  it("shows Value updating only for missing row under 10 minutes", () => {
    const createdAt = new Date(now - VALUE_UPDATING_WINDOW_MS + 60_000).toISOString();
    assert.equal(
      formatCardValueLabel(null, { createdAt, now }),
      "Value updating",
    );
  });

  it("shows No sales yet for missing row older than 10 minutes", () => {
    const createdAt = new Date(now - VALUE_UPDATING_WINDOW_MS - 1).toISOString();
    assert.equal(
      formatCardValueLabel(null, { createdAt, now }),
      "No sales yet",
    );
  });

  it("shows No sales yet for missing row without createdAt", () => {
    assert.equal(formatCardValueLabel(undefined), "No sales yet");
  });
});
