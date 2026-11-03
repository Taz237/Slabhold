import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quickCompStats, saleSpan, trustLine } from "./stats";

describe("quick comp stats", () => {
  it("averages the kept sales and finds the high and low", () => {
    assert.deepEqual(quickCompStats([{ soldPrice: 40 }, { soldPrice: 52.5 }, { soldPrice: 31 }]), {
      avg: 41.17,
      high: 52.5,
      low: 31,
    });
  });

  it("never reads $0: no sales or no real prices is null", () => {
    assert.equal(quickCompStats([]), null);
    assert.equal(quickCompStats([{ soldPrice: 0 }, { soldPrice: Number.NaN }]), null);
    assert.deepEqual(quickCompStats([{ soldPrice: 0 }, { soldPrice: 12 }]), { avg: 12, high: 12, low: 12 });
  });

  it("writes one trust line with the count and the span", () => {
    assert.equal(
      trustLine([{ soldDate: "2026-10-30" }, { soldDate: "2026-09-04" }, { soldDate: "2026-10-01" }]),
      "3 sales · Sep 4–Oct 30",
    );
    assert.equal(trustLine([{ soldDate: "2026-10-30" }]), "1 sale · Oct 30");
    assert.equal(trustLine([]), "");
    assert.equal(saleSpan(["2025-12-20", "2026-01-04"]), "Dec 20, 2025–Jan 4, 2026");
  });
});
