import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCardValueLabel } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";
import { previewValueLabelFromSources } from "./preview-value";

const STORED_THREE: CardValueResult = {
  status: "ok",
  median: 3,
  low: 2,
  high: 4,
  nSales: 9,
  matchedAt: "2026-10-18T00:00:00.000Z",
};

describe("share preview reads card_values only", () => {
  it("uses the stored $3.00 label", () => {
    const label = previewValueLabelFromSources({ stored: STORED_THREE });
    assert.equal(label, "$3.00");
    assert.equal(label, formatCardValueLabel(STORED_THREE));
  });

  it("formats 112.50 the same way as the card page", () => {
    const stored: CardValueResult = {
      status: "ok",
      median: 112.5,
      low: 100,
      high: 130,
      nSales: 4,
      matchedAt: "2026-10-19T00:00:00.000Z",
    };
    assert.equal(previewValueLabelFromSources({ stored }), "$112.50");
    assert.equal(previewValueLabelFromSources({ stored }), formatCardValueLabel(stored));
  });

  it("does not show a stale median", () => {
    const stored: CardValueResult = {
      status: "stale",
      median: 99,
      low: 99,
      high: 99,
      nSales: 4,
      matchedAt: "2026-10-01T00:00:00.000Z",
    };
    assert.equal(
      previewValueLabelFromSources({ stored }),
      "Value unavailable right now",
    );
  });
});
