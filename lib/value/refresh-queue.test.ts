import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { preserveValueOnFailedAttempt } from "./refresh-result";
import {
  cardRefreshLog,
  takeRefreshBatch,
  trawlCronBudget,
} from "./refresh-queue";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const JAXSON = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const LOVE = "c2318e7d-41f2-4bb6-96df-250cd8e13773";

describe("refresh queue", () => {
  it("picks the oldest matched_at first, and never-checked cards before those", () => {
    const { picked } = takeRefreshBatch(
      [
        { cardId: LOVE, matchedAt: "2026-10-19T09:51:38.960Z" },
        { cardId: JAXSON, matchedAt: "2026-10-17T16:04:57.078Z" },
        { cardId: "new-card", matchedAt: null },
      ],
      3,
    );
    assert.deepEqual(
      picked.map((card) => card.cardId),
      ["new-card", JAXSON, LOVE],
    );
  });

  it("leaves cards past the budget for the next run", () => {
    const cards = [
      { cardId: "oldest", matchedAt: "2026-10-16T18:01:29.483Z" },
      { cardId: JAXSON, matchedAt: "2026-10-17T16:04:57.078Z" },
      { cardId: LOVE, matchedAt: "2026-10-19T09:51:38.960Z" },
    ];
    const first = takeRefreshBatch(cards, 1);
    assert.equal(first.picked[0]?.cardId, "oldest");
    assert.equal(first.remaining, 2);

    const checked = new Date("2026-10-20T09:00:00.000Z").toISOString();
    const second = takeRefreshBatch(
      cards.map((card) =>
        card.cardId === "oldest" ? { ...card, matchedAt: checked } : card,
      ),
      1,
    );
    assert.equal(second.picked[0]?.cardId, JAXSON);
    assert.equal(second.remaining, 2);
  });

  it("defaults the cron budget to 25 and caps it at 100", () => {
    assert.equal(trawlCronBudget(undefined), 25);
    assert.equal(trawlCronBudget(""), 25);
    assert.equal(trawlCronBudget("0"), 25);
    assert.equal(trawlCronBudget("nope"), 25);
    assert.equal(trawlCronBudget("10"), 10);
    assert.equal(trawlCronBudget("1000"), 100);
  });

  it("keeps the stored price and moves matched_at when an attempt fails", () => {
    const stamped = preserveValueOnFailedAttempt(
      {
        median: 50,
        low: 40,
        high: 60,
        nSales: 9,
        matchedAt: "2026-10-17T16:04:57.078Z",
      },
      "2026-10-19T09:00:00.000Z",
    );
    assert.equal(stamped.median, 50);
    assert.equal(stamped.low, 40);
    assert.equal(stamped.high, 60);
    assert.equal(stamped.nSales, 9);
    assert.equal(stamped.matchedAt, "2026-10-19T09:00:00.000Z");
  });

  it("logs at most 10 kept and dropped titles", () => {
    const line = cardRefreshLog({
      cardId: JAXSON,
      result: "kept",
      reason: "no_matches",
      matched: 0,
      keptTitles: Array.from({ length: 12 }, (_, i) => `kept ${i}`),
      droppedTitles: Array.from({ length: 12 }, (_, i) => `dropped ${i}`),
    });
    assert.equal(line.kept_titles.length, 10);
    assert.equal(line.dropped_titles.length, 10);
    assert.equal(line.reason, "no_matches");
    assert.equal(line.card_id, JAXSON);
  });
});

describe("daily refresh cron", () => {
  it("does not use the per-user Trawl limiter", () => {
    const route = read("app/api/cron/refresh-card-values/route.ts");
    const refresh = read("lib/value/getCardValue.ts");
    assert.equal(route.includes("consumeTrawlLimit"), false);
    assert.equal(route.includes("TRAWL_LIMIT"), false);
    assert.equal(route.includes("listStaleCardIds"), false);
    assert.match(route, /TRAWL_CRON_BUDGET/);
    assert.match(route, /takeRefreshBatch/);
    assert.match(refresh, /preserveValueOnFailedAttempt/);
    assert.match(read("app/api/card-values/refresh/route.ts"), /consumeTrawlLimit\(userId\)/);
    assert.match(read("app/api/comps/sold/route.ts"), /consumeTrawlLimit\(userId\)/);
  });
});
