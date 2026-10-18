import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VALUE_UPDATING_WINDOW_MS,
  formatCardValueLabel,
  isLowConfidenceValue,
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

  it("shows Not enough sales yet for no_sales", () => {
    assert.equal(
      formatCardValueLabel(value({ status: "no_sales" })),
      "Not enough sales yet",
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

  it("shows Not enough sales yet for missing row older than 10 minutes", () => {
    const createdAt = new Date(now - VALUE_UPDATING_WINDOW_MS - 1).toISOString();
    assert.equal(
      formatCardValueLabel(null, { createdAt, now }),
      "Not enough sales yet",
    );
  });

  it("shows Not enough sales yet for missing row without createdAt", () => {
    assert.equal(formatCardValueLabel(undefined), "Not enough sales yet");
  });

  it("hides a median that is not backed by a matching sale", () => {
    assert.equal(
      formatCardValueLabel(value({ status: "ok", median: 80, nSales: 0 })),
      "Not enough sales yet",
    );
  });
});

describe("isLowConfidenceValue", () => {
  it("is false for zero sales and no_sales", () => {
    assert.equal(isLowConfidenceValue(value({ status: "no_sales", nSales: 0 })), false);
    assert.equal(isLowConfidenceValue(value({ status: "ok", median: 10, nSales: 0 })), false);
  });

  it("is true only when 0 < N < 5", () => {
    assert.equal(isLowConfidenceValue(value({ status: "ok", median: 10, nSales: 1 })), true);
    assert.equal(isLowConfidenceValue(value({ status: "ok", median: 10, nSales: 4 })), true);
    assert.equal(isLowConfidenceValue(value({ status: "ok", median: 10, nSales: 5 })), false);
  });
});
