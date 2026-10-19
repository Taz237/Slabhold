import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { cardCacheTag, revalidateCardCache } from "./card-cache";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("card cache tag", () => {
  it("revalidateTag is called with card:id", () => {
    const calls: Array<{ tag: string; profile: string | { expire?: number } }> = [];
    revalidateCardCache("ba95893e-89fe-4735-be3f-1509b6b6f3b9", (tag, profile) => {
      calls.push({ tag, profile });
    });
    assert.deepEqual(calls, [
      {
        tag: cardCacheTag("ba95893e-89fe-4735-be3f-1509b6b6f3b9"),
        profile: { expire: 0 },
      },
    ]);
    assert.equal(calls[0]?.tag, "card:ba95893e-89fe-4735-be3f-1509b6b6f3b9");
  });

  it("revalidateTag is called on refresh, flag, undo, and edit", () => {
    const refresh = source("app/api/card-values/refresh/route.ts");
    const flags = source("app/api/comps/flags/route.ts");
    const cron = source("app/api/cron/refresh-card-values/route.ts");
    const sold = source("app/api/comps/sold/route.ts");

    assert.match(refresh, /revalidateCard\(id\)/);
    assert.match(cron, /revalidateCard\(candidate\.cardId\)/);
    assert.match(flags, /revalidateCard\(cardId\)/);
    assert.match(flags, /export async function POST/);
    assert.match(flags, /export async function DELETE/);
    assert.match(flags, /repriceFromCache\(cardId\)/);
    assert.match(sold, /loadCachedCardRefresh/);
    assert.match(source("lib/value/card-market.ts"), /revalidateTag/);
    assert.match(source("lib/value/card-market.ts"), /unstable_cache/);
    assert.match(source("lib/value/card-market.ts"), /card:\$\{cardId\}|cardCacheTag/);
  });
});
