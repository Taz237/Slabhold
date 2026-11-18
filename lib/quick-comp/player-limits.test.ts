import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUICK_COMP_DAY_BUCKET, spendQuickCompLookup } from "./limits";
import {
  makePlayerSearchLimits,
  PLAYER_DAILY_MESSAGE,
  PLAYER_SEARCH_DAY_BUCKET,
  PLAYER_SEARCH_HOUR_BUCKET,
  playerLimitMessage,
} from "./player-limits";

/** The rate-limit table in memory: bucket → count, per window (one window for the test). */
function table() {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  const consume = async (userId: string, bucket: string, _windowMs: number, limit: number) => {
    calls.push(bucket);
    const next = (counts.get(bucket) ?? 0) + 1;
    if (next > limit) return false;
    counts.set(bucket, next);
    return true;
  };
  return { consume, counts, calls };
}

describe("Player search caps", () => {
  it("3 an hour, in player search's own buckets", async () => {
    const db = table();
    const deps = { ...makePlayerSearchLimits(db.consume), now: () => Date.UTC(2026, 10, 17, 12) };
    for (let n = 0; n < 3; n++) assert.deepEqual(await spendQuickCompLookup("u", deps), { ok: true });
    const fourth = await spendQuickCompLookup("u", deps);
    assert.equal(fourth.ok, false);
    if (!fourth.ok) assert.equal(fourth.reason, "hourly");
    assert.ok(db.calls.every((bucket) => bucket === PLAYER_SEARCH_DAY_BUCKET || bucket === PLAYER_SEARCH_HOUR_BUCKET), db.calls.join());
    assert.ok(!(db.calls as string[]).includes(QUICK_COMP_DAY_BUCKET), "never Quick Comp's day cap");
  });

  it("5 a day, then the friendly note", async () => {
    const db = table();
    const deps = makePlayerSearchLimits(db.consume);
    // A new hour each time: only the day cap is left to stop it.
    for (let n = 0; n < 5; n++) {
      db.counts.delete(PLAYER_SEARCH_HOUR_BUCKET);
      assert.equal((await spendQuickCompLookup("u", deps)).ok, true);
    }
    db.counts.delete(PLAYER_SEARCH_HOUR_BUCKET);
    const sixth = await spendQuickCompLookup("u", deps);
    assert.equal(sixth.ok, false);
    if (!sixth.ok) {
      assert.equal(sixth.reason, "daily");
      assert.equal(playerLimitMessage(sixth.reason), PLAYER_DAILY_MESSAGE);
    }
    assert.equal(PLAYER_DAILY_MESSAGE, "You've looked up 5 players today");
  });

  it("the server wires player search to these caps, not Quick Comp's", async () => {
    const { readFileSync } = await import("node:fs");
    const server = readFileSync("lib/quick-comp/player-server.ts", "utf8");
    assert.match(server, /limits: serverPlayerSearchLimits/);
    assert.doesNotMatch(server, /serverQuickCompLimits|serverLiveSoldsDeps\.liveSearch/);
    const limits = readFileSync("lib/quick-comp/limits-server.ts", "utf8");
    assert.match(limits, /serverPlayerSearchLimits: QuickCompLimitDeps = makePlayerSearchLimits\(consumeRateLimit, teamCheck\)/);
  });
});
