import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  respondSoldComps,
  type SoldCompsLoaders,
  type SoldRefreshResult,
} from "./sold-response";

function emptyResult(
  reason = "unavailable",
): SoldRefreshResult {
  return {
    attempt: { reason },
    payload: null,
  };
}

class FakeMarketUnavailable extends Error {
  readonly result: SoldRefreshResult;
  constructor(result: SoldRefreshResult) {
    super(result.attempt.reason);
    this.name = "CardMarketUnavailable";
    this.result = result;
  }
}

describe("respondSoldComps access-first not-found", () => {
  it("returns not-found before any comps/value loader is called", async () => {
    let refreshCalls = 0;
    const loaders: SoldCompsLoaders = {
      lookupAccess: async () => "hidden",
      loadRefresh: async () => {
        refreshCalls += 1;
        throw new Error("comps/value loader must not run for hidden cards");
      },
      beforeRequest: async () => true,
      beforeTrawl: async () => true,
    };

    const res = await respondSoldComps("card-1", "user-1", loaders);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "Card not found");
    assert.equal(refreshCalls, 0);
  });

  it("does not fall back to an uncached refresh when the cached loader fails", async () => {
    let refreshCalls = 0;
    const loaders: SoldCompsLoaders = {
      lookupAccess: async () => "owner",
      loadRefresh: async () => {
        refreshCalls += 1;
        throw new FakeMarketUnavailable(emptyResult());
      },
      beforeRequest: async () => true,
      beforeTrawl: async () => true,
    };

    const res = await respondSoldComps("card-1", "user-1", loaders);
    assert.equal(res.status, 503);
    assert.equal(refreshCalls, 1);
  });
});
