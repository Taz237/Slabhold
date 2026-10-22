import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  buildCardValueHistoryRows,
  cardValueHistoryEnabled,
  isMissingRelation,
  numericFromUnknown,
  runCardValueHistoryCron,
  shouldShowYourCardsSinceYesterday,
} from "./card-value-history";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("card value history flag", () => {
  it("stays off unless the flag is exactly 1", () => {
    assert.equal(cardValueHistoryEnabled({}), false);
    assert.equal(cardValueHistoryEnabled({ CARD_VALUE_HISTORY_ENABLED: "" }), false);
    assert.equal(cardValueHistoryEnabled({ CARD_VALUE_HISTORY_ENABLED: "true" }), false);
    assert.equal(cardValueHistoryEnabled({ CARD_VALUE_HISTORY_ENABLED: "1" }), true);
  });

  it("does not read or write while the flag is off", async () => {
    const result = await runCardValueHistoryCron({
      enabled: () => false,
      tableExists: () => Promise.reject(new Error("should not read")),
      write: () => Promise.reject(new Error("should not write")),
    });
    assert.deepEqual(result, { ok: true, skipped: "flag", written: 0 });
  });

  it("does not write when the table is missing", async () => {
    let wrote = false;
    const result = await runCardValueHistoryCron({
      enabled: () => true,
      tableExists: async () => false,
      write: async () => {
        wrote = true;
        return 4;
      },
    });
    assert.equal(wrote, false);
    assert.deepEqual(result, { ok: true, skipped: "missing_table", written: 0 });
  });

  it("writes only after the flag is on and the table exists", async () => {
    const result = await runCardValueHistoryCron({
      enabled: () => true,
      tableExists: async () => true,
      write: async () => 3,
    });
    assert.deepEqual(result, { ok: true, skipped: null, written: 3 });
  });
});

describe("card value history rows", () => {
  it("stores yesterday's median and leaves the delta empty without it", () => {
    assert.equal(numericFromUnknown(null), null);
    assert.equal(numericFromUnknown("12.5"), 12.5);
    const rows = buildCardValueHistoryRows({
      userId: "user-1",
      snapshotDate: "2026-10-22",
      current: [
        { cardId: "card-a", median: 40 },
        { cardId: "card-b", median: 10 },
        { cardId: "card-b", median: 99 },
      ],
      previous: [{ cardId: "card-a", median: 25 }],
    });
    assert.deepEqual(rows, [
      {
        user_id: "user-1",
        card_id: "card-a",
        snapshot_date: "2026-10-22",
        median: 40,
        previous_median: 25,
        delta: 15,
      },
      {
        user_id: "user-1",
        card_id: "card-b",
        snapshot_date: "2026-10-22",
        median: 10,
        previous_median: null,
        delta: null,
      },
    ]);
  });

  it("stays out of the home UI until the table exists", () => {
    assert.equal(shouldShowYourCardsSinceYesterday({ tableExists: false, moverCount: 3 }), false);
    assert.equal(shouldShowYourCardsSinceYesterday({ tableExists: true, moverCount: 0 }), false);
    assert.equal(shouldShowYourCardsSinceYesterday({ tableExists: true, moverCount: 2 }), true);
    const feed = read("components/feed-view.tsx");
    const today = read("components/collection-today.tsx");
    assert.doesNotMatch(feed, /card_value_history|card-value-history/);
    assert.doesNotMatch(today, /card_value_history/);
  });
});

describe("card value history migration and cron", () => {
  it("lets a user read only their own rows and is not scheduled", () => {
    const sql = read("supabase/migrations/20261022152059_card_value_history.sql");
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /for select/);
    assert.match(sql, /to authenticated/);
    assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
    assert.match(sql, /grant select on public\.card_value_history to authenticated/);
    assert.match(sql, /revoke all on public\.card_value_history from anon, authenticated/);
    assert.doesNotMatch(sql, /for insert|for update|for delete/i);
    assert.doesNotMatch(sql, /drop table|delete from|truncate/i);
    assert.match(sql, /card_value_history_user_date_idx/);

    const route = read("app/api/cron/card-value-history/route.ts");
    const body = route.slice(route.indexOf("export async function GET"));
    const auth = body.indexOf("cronAuthorized");
    const cron = body.indexOf("runCardValueHistory()");
    assert.ok(auth > 0 && auth < cron);
    assert.match(route, /CARD_VALUE_HISTORY_ENABLED/);
    assert.match(read("lib/collection/card-value-history-run.ts"), /from\("card_values"\)/);

    const vercel = read("vercel.json");
    assert.doesNotMatch(vercel, /card-value-history/);
    assert.equal(isMissingRelation({ code: "42P01", message: "relation does not exist" }), true);
    assert.equal(isMissingRelation({ code: "PGRST205", message: "schema cache" }), true);
    assert.equal(isMissingRelation(null), false);
  });
});
