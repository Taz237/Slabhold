import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { repriceCardFromCache, type RepriceRefreshResult } from "./reprice-from-cache";

function okResult(nSales: number): RepriceRefreshResult {
  return { nSales, status: "ok" };
}

describe("repriceCardFromCache", () => {
  it("awaits the recompute and calls revalidateTag before resolving", async () => {
    const order: string[] = [];
    let resolveRefresh!: (value: RepriceRefreshResult) => void;
    const refreshPromise = new Promise<RepriceRefreshResult>((resolve) => {
      resolveRefresh = resolve;
    });

    const done = repriceCardFromCache("card-1", {
      refresh: async () => {
        order.push("refresh-start");
        const result = await refreshPromise;
        order.push("refresh-done");
        return result;
      },
      revalidate: (cardId) => {
        order.push(`revalidate:${cardId}`);
      },
    });

    // Still waiting on recompute — revalidate must not have run yet.
    await Promise.resolve();
    assert.deepEqual(order, ["refresh-start"]);

    resolveRefresh(okResult(42));
    const result = await done;
    assert.equal(result.nSales, 42);
    assert.deepEqual(order, [
      "refresh-start",
      "refresh-done",
      "revalidate:card-1",
    ]);
  });

  it("revalidates even when recompute throws, still after the attempt", async () => {
    const order: string[] = [];
    await assert.rejects(
      () =>
        repriceCardFromCache("card-1", {
          refresh: async () => {
            order.push("refresh");
            throw new Error("boom");
          },
          revalidate: () => {
            order.push("revalidate");
          },
        }),
      /boom/,
    );
    assert.deepEqual(order, ["refresh", "revalidate"]);
  });

  it("flag undo and restore await reprice before returning", () => {
    const flags = readFileSync(
      join(process.cwd(), "app/api/comps/flags/route.ts"),
      "utf8",
    );
    const market = readFileSync(
      join(process.cwd(), "lib/value/card-market.ts"),
      "utf8",
    );
    assert.match(flags, /await repriceFromCache\(cardId\)/);
    assert.match(flags, /repriceCardFromCache\(cardId/);
    assert.match(flags, /export async function DELETE/);
    assert.match(flags, /export async function POST/);
    assert.match(market, /revalidateTag/);
    assert.match(market, /revalidatePath\(`\/cards\/\$\{cardId\}`\)/);
  });
});
