import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  buildCardValueHistoryRows,
  CARD_VALUE_HISTORY_RETENTION_DAYS,
  CARD_VALUE_HISTORY_RUN_CAP,
  cardValueHistoryEnabled,
  historyRetentionCutoff,
  historyRotationCursor,
  isFreshMatchedCardValue,
  rotateCardValueHistoryBatch,
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

describe("card value history rotation", () => {
  it("gives card 1001 and later a row on the next run", () => {
    const cards = Array.from({ length: 1200 }, (_, index) => ({
      cardId: `card-${String(index + 1).padStart(4, "0")}`,
      median: 12,
    }));
    const first = rotateCardValueHistoryBatch(cards, {
      cap: CARD_VALUE_HISTORY_RUN_CAP,
      alreadyWrittenIds: [],
    });
    assert.equal(first.length, 1000);
    assert.equal(first[0]?.cardId, "card-0001");
    assert.equal(first[999]?.cardId, "card-1000");
    assert.equal(first.some((card) => card.cardId === "card-1001"), false);

    const second = rotateCardValueHistoryBatch(cards, {
      cap: CARD_VALUE_HISTORY_RUN_CAP,
      alreadyWrittenIds: first.map((card) => card.cardId),
    });
    assert.equal(second[0]?.cardId, "card-1001");
    assert.equal(second.at(-1)?.cardId, "card-1200");
    assert.equal(second.some((card) => card.cardId <= "card-1000"), false);
    assert.equal(second.length, 200);
  });

  it("writes each of 1200 cards once before any repeat across two days", () => {
    const cards = Array.from({ length: 1200 }, (_, index) => ({
      cardId: `card-${String(index + 1).padStart(4, "0")}`,
    }));
    const orderedIds = cards.map((card) => card.cardId);
    const day1 = rotateCardValueHistoryBatch(cards, {
      cap: 1000,
      alreadyWrittenIds: [],
    });
    const cursor = historyRotationCursor(orderedIds, day1.map((card) => card.cardId));
    assert.equal(cursor, "card-1000");
    assert.equal(cursor, day1.at(-1)?.cardId);

    const day2 = rotateCardValueHistoryBatch(cards, {
      cap: 1000,
      alreadyWrittenIds: [],
      afterCardId: cursor,
    });
    const seen = new Set<string>();
    for (const card of [...day1, ...day2]) {
      if (seen.has(card.cardId)) {
        assert.equal(seen.size, 1200);
        break;
      }
      seen.add(card.cardId);
    }
    assert.equal(seen.size, 1200);

    const nextCursor = historyRotationCursor(orderedIds, day2.map((card) => card.cardId));
    const maxId = day2.reduce((max, card) => (card.cardId > max ? card.cardId : max), "");
    assert.equal(nextCursor, "card-0800");
    assert.equal(nextCursor, day2.at(-1)?.cardId);
    assert.equal(maxId, "card-1200");
    assert.notEqual(nextCursor, maxId);
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
    const run = read("lib/collection/card-value-history-run.ts");
    assert.match(run, /from\("card_values"\)/);
    assert.match(run, /isFreshMatchedCardValue/);
    assert.match(run, /\.eq\("status", "ok"\)/);
    assert.match(run, /CARD_VALUE_HISTORY_RUN_CAP/);
    assert.match(run, /\.delete\(\)/);
    assert.match(run, /historyRetentionCutoff/);
    const deleteAt = run.indexOf(".delete()");
    const upsertAt = run.lastIndexOf(".upsert(");
    assert.ok(upsertAt > 0 && deleteAt > upsertAt);
    assert.equal(CARD_VALUE_HISTORY_RETENTION_DAYS, 400);
    assert.equal(CARD_VALUE_HISTORY_RUN_CAP, 1000);
    assert.equal(historyRetentionCutoff("2026-10-22"), "2025-09-17");
    assert.equal(isFreshMatchedCardValue({ status: "ok", median: 40 }), true);
    assert.equal(isFreshMatchedCardValue({ status: "ok", median: null }), false);
    assert.equal(isFreshMatchedCardValue({ status: "stale", median: 40 }), false);
    assert.equal(isFreshMatchedCardValue({ status: "sample", median: 40 }), false);
    assert.equal(isFreshMatchedCardValue({ status: "no_sales", median: null }), false);
    assert.match(run, /rotateCardValueHistoryBatch/);
    assert.match(run, /historyRotationCursor/);
    assert.doesNotMatch(run, /ascending: false/);

    const vercel = read("vercel.json");
    assert.doesNotMatch(vercel, /card-value-history/);
    assert.equal(isMissingRelation({ code: "42P01", message: "relation does not exist" }), true);
    assert.equal(isMissingRelation({ code: "PGRST205", message: "schema cache" }), true);
    assert.equal(isMissingRelation(null), false);
  });
});
