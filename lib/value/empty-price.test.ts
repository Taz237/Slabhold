import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldCollapseEmptyPrices } from "./empty-price";

describe("empty price collapse", () => {
  it("collapses only when estimate, comps, and sales are all empty and settled", () => {
    assert.equal(
      shouldCollapseEmptyPrices({
        loading: false,
        blocked: false,
        settled: true,
        hasEstimate: false,
        hasSales: false,
      }),
      true,
    );
    assert.equal(
      shouldCollapseEmptyPrices({
        loading: false,
        blocked: false,
        settled: true,
        hasEstimate: true,
        hasSales: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseEmptyPrices({
        loading: false,
        blocked: false,
        settled: true,
        hasEstimate: false,
        hasSales: true,
      }),
      false,
    );
  });

  it("waits while prices are loading, blocked, or not settled", () => {
    const empty = { hasEstimate: false, hasSales: false };
    assert.equal(
      shouldCollapseEmptyPrices({ ...empty, loading: true, blocked: false, settled: true }),
      false,
    );
    assert.equal(
      shouldCollapseEmptyPrices({ ...empty, loading: false, blocked: true, settled: true }),
      false,
    );
    assert.equal(
      shouldCollapseEmptyPrices({ ...empty, loading: false, blocked: false, settled: false }),
      false,
    );
  });
});
