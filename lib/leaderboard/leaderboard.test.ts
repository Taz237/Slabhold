import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { renderOg } from "@/components/og-frame";
import { LeaderboardView } from "@/components/leaderboard-view";
import { dailyTopGainerBadge, leaderboardBadgeChips, weeklyTopBadge } from "@/lib/leaderboard/badges";
import { withoutBlocked } from "@/lib/leaderboard/blocks";
import { addDaysToYmd, formatSnapshotDate, isNewYorkMonday, leaderboardDates } from "@/lib/leaderboard/dates";
import {
  LEADERBOARD_CLOSED_COPY,
  LEADERBOARD_NOTE,
  isLeaderboardEligible,
  leaderboardMinimums,
  leaderboardOpens,
} from "@/lib/leaderboard/eligibility";
import { rankLeaderboard, sameCardsChange } from "@/lib/leaderboard/math";
import {
  LEADERBOARD_OPT_IN_LABEL,
  leaderboardPromptDismissKey,
  leaderboardPromptVisible,
  readLeaderboardOptIn,
  saveLeaderboardOptIn,
  type LeaderboardOptInDb,
} from "@/lib/leaderboard/opt-in";
import { publicValuedTotals } from "@/lib/leaderboard/public-value";
import {
  ESTIMATED_FROM_SOLD,
  leaderboardRankShareImage,
  rankShareText,
} from "@/lib/leaderboard/share";
import type { LeaderboardModel } from "@/lib/leaderboard/types";
import { cardValueHistoryEnabled } from "@/lib/collection/card-value-history";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function memoryDb(initial: boolean | null, missing = false): LeaderboardOptInDb {
  let stored = initial;
  const api = {
    eq() {
      return api;
    },
    select() {
      return api;
    },
    update(values: { leaderboard_opt_in: boolean }) {
      stored = values.leaderboard_opt_in;
      return api;
    },
    async maybeSingle() {
      if (missing) {
        return {
          data: null,
          error: { message: "column leaderboard_opt_in does not exist", code: "42703" },
        };
      }
      return { data: { leaderboard_opt_in: stored }, error: null };
    },
  };
  return {
    from() {
      return api;
    },
  };
}

function point(cardId: string, median: number | null) {
  return { cardId, median };
}

describe("leaderboard math", () => {
  it("ranks the percent change of cards held on both dates", () => {
    const change = sameCardsChange({
      prior: [point("a", 40), point("b", 60), point("c", 10)],
      today: [point("a", 50), point("b", 50), point("c", 10)],
    });
    assert.equal(change.priorSum, 110);
    assert.equal(change.todaySum, 110);
    assert.equal(change.delta, 0);
    assert.equal(change.percent, 0);
    assert.equal(change.cardCount, 3);

    const gain = sameCardsChange({
      prior: [point("a", 80), point("b", 20)],
      today: [point("a", 100), point("b", 28)],
    });
    assert.equal(gain.delta, 28);
    assert.equal(gain.percent, 0.28);
    assert.equal(gain.cardCount, 2);

    const loss = sameCardsChange({
      prior: [point("a", 50)],
      today: [point("a", 40)],
    });
    assert.equal(loss.delta, -10);
    assert.equal(loss.percent, -0.2);
  });

  it("ignores cards added, removed, or missing a median, and skips divide-by-zero", () => {
    const change = sameCardsChange({
      prior: [point("kept", 25), point("sold", 40), point("blank", null), point("zero", 0)],
      today: [point("kept", 30), point("added", 99), point("blank", 10), point("none", null)],
    });
    assert.equal(change.cardCount, 1);
    assert.equal(change.priorSum, 25);
    assert.equal(change.todaySum, 30);
    assert.equal(change.delta, 5);
    assert.equal(change.percent, 0.2);

    const zero = sameCardsChange({
      prior: [point("a", 0), point("b", null)],
      today: [point("a", 10), point("b", 10)],
    });
    assert.equal(zero.priorSum, 0);
    assert.equal(zero.percent, null);
    assert.equal(zero.cardCount, 1);

    const empty = sameCardsChange({ prior: [], today: [point("a", 10)] });
    assert.equal(empty.percent, null);
    assert.equal(empty.cardCount, 0);
  });

  it("orders gainers and losers, then dollars, then handle", () => {
    const rows = [
      { userId: "2", username: "bea", percent: 0.1, delta: 5 },
      { userId: "1", username: "ada", percent: 0.2, delta: 1 },
      { userId: "3", username: "cy", percent: 0.1, delta: 9 },
    ];
    assert.deepEqual(
      rankLeaderboard(rows, "gainers").map((row) => row.username),
      ["ada", "cy", "bea"],
    );
    assert.equal(rankLeaderboard(rows, "gainers")[0]?.rank, 1);
    assert.deepEqual(
      rankLeaderboard(rows, "losers").map((row) => row.username),
      ["bea", "cy", "ada"],
    );
  });
});

describe("leaderboard eligibility", () => {
  const base = {
    optedIn: true,
    publicCollection: true,
    valuedCards: 5,
    value: 100,
    username: "ada",
  };

  it("requires a public opted-in book of 5 valued cards and $100", () => {
    assert.equal(isLeaderboardEligible(base), true);
    assert.equal(isLeaderboardEligible({ ...base, optedIn: false }), false);
    assert.equal(isLeaderboardEligible({ ...base, publicCollection: false }), false);
    assert.equal(isLeaderboardEligible({ ...base, valuedCards: 4 }), false);
    assert.equal(isLeaderboardEligible({ ...base, value: 99.99 }), false);
    assert.equal(isLeaderboardEligible({ ...base, value: 100 }), true);
  });

  it("drops test accounts and raises the floor from the environment", () => {
    assert.equal(isLeaderboardEligible({ ...base, isTest: true }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "qa_ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "qa-ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "test_ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "vreset_ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "qa_vreset_1021" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "slabhold" }), true);

    assert.deepEqual(leaderboardMinimums({}), { minCards: 5, minValue: 100 });
    assert.deepEqual(
      leaderboardMinimums({ LEADERBOARD_MIN_CARDS: "8", LEADERBOARD_MIN_VALUE: "250" }),
      { minCards: 8, minValue: 250 },
    );
    assert.deepEqual(
      leaderboardMinimums({ LEADERBOARD_MIN_CARDS: "1", LEADERBOARD_MIN_VALUE: "10" }),
      { minCards: 5, minValue: 100 },
    );
    assert.equal(
      isLeaderboardEligible({ ...base, valuedCards: 5, minCards: 8, minValue: 100 }),
      false,
    );
  });

  it("counts only public held cards that have a median", () => {
    const valued = {
      status: "ok",
      median: 40,
      low: 30,
      high: 50,
      nSales: 3,
      matchedAt: null,
    } satisfies CardValueResult;
    const cards = [
      { id: "public", isPublic: true, sellPrice: null, sellDate: null },
      { id: "private", isPublic: false, sellPrice: null, sellDate: null },
      { id: "sold", isPublic: true, sellPrice: 10, sellDate: "2026-10-01" },
      { id: "empty", isPublic: true, sellPrice: null, sellDate: null },
    ] as SportsCard[];
    const values = new Map<string, CardValueResult>([
      ["public", valued],
      ["private", valued],
      ["sold", valued],
      ["empty", { ...valued, median: null, status: "no_sales", nSales: 0 }],
    ]);
    assert.deepEqual(publicValuedTotals(cards, values), { count: 1, value: 40 });
  });

  it("opens a tab only at 10 qualifying collections", () => {
    assert.equal(leaderboardOpens(9), false);
    assert.equal(leaderboardOpens(10), true);
    assert.equal(LEADERBOARD_CLOSED_COPY, "Leaderboard opens when 10 collectors join, opt in");
  });

  it("hides people who blocked each other", () => {
    const rows = [
      { userId: "ada" },
      { userId: "bea" },
      { userId: "cy" },
    ];
    assert.deepEqual(
      withoutBlocked(rows, new Set(["bea"])).map((row) => row.userId),
      ["ada", "cy"],
    );
  });
});

describe("leaderboard opt-in", () => {
  it("stays off until the owner turns it on", async () => {
    const db = memoryDb(null);
    assert.deepEqual(await readLeaderboardOptIn(db, "ada"), { optedIn: false });
    assert.deepEqual(await saveLeaderboardOptIn(db, "ada", true), { optedIn: true });
    assert.deepEqual(await readLeaderboardOptIn(db, "ada"), { optedIn: true });
    assert.equal(LEADERBOARD_OPT_IN_LABEL, "Show me on leaderboards");
    assert.equal(leaderboardPromptDismissKey("ada"), "slabhold.leaderboard-prompt.dismissed.ada");
  });

  it("treats a missing column as opted out", async () => {
    const read = await readLeaderboardOptIn(memoryDb(null, true), "ada");
    assert.equal(read.optedIn, false);
    assert.equal(read.error, undefined);
  });

  it("prompts once when the book clears the minimums and the owner is still opted out", () => {
    assert.equal(
      leaderboardPromptVisible({ eligible: true, optedIn: false, dismissed: false }),
      true,
    );
    assert.equal(
      leaderboardPromptVisible({ eligible: true, optedIn: true, dismissed: false }),
      false,
    );
    assert.equal(
      leaderboardPromptVisible({ eligible: true, optedIn: false, dismissed: true }),
      false,
    );
    assert.equal(
      leaderboardPromptVisible({ eligible: false, optedIn: false, dismissed: false }),
      false,
    );
  });
});

describe("leaderboard badges and sharing", () => {
  it("gives the daily leader a dated chip and the week top 3 a Monday chip", () => {
    assert.equal(dailyTopGainerBadge({ rank: 1, dateLabel: "Oct 22" }), "Top gainer, Oct 22");
    assert.equal(dailyTopGainerBadge({ rank: 2, dateLabel: "Oct 22" }), null);
    assert.equal(weeklyTopBadge({ rank: 3, monday: true }), "Top 3 this week");
    assert.equal(weeklyTopBadge({ rank: 3, monday: false }), null);
    assert.equal(weeklyTopBadge({ rank: 4, monday: true }), null);
    assert.deepEqual(
      leaderboardBadgeChips({
        userId: "ada",
        day: [{ userId: "ada", rank: 1 }],
        week: [{ userId: "ada", rank: 2 }],
        monday: true,
        dateLabel: "Oct 19",
        hidden: false,
      }),
      ["Top gainer, Oct 19", "Top 3 this week"],
    );
    assert.deepEqual(
      leaderboardBadgeChips({
        userId: "ada",
        day: [{ userId: "ada", rank: 1 }],
        week: [],
        monday: true,
        dateLabel: "Oct 19",
        hidden: true,
      }),
      [],
    );
  });

  it("compares yesterday and seven days ago on the New York calendar", () => {
    const dates = leaderboardDates(new Date("2026-10-22T03:30:00.000Z"));
    assert.equal(dates.today, "2026-10-21");
    assert.equal(dates.yesterday, "2026-10-20");
    assert.equal(dates.weekAgo, "2026-10-14");
    assert.equal(addDaysToYmd("2026-10-22", -7), "2026-10-15");
    assert.equal(formatSnapshotDate("2026-10-22"), "Oct 22");
    assert.equal(isNewYorkMonday(new Date("2026-10-19T16:00:00.000Z")), true);
    assert.equal(isNewYorkMonday(new Date("2026-10-20T16:00:00.000Z")), false);
  });

  it("shares a rank card from sold prices without a team logo", async () => {
    assert.equal(
      rankShareText({ username: "user", percent: 0.082, window: "day" }),
      "@user up 8.2% today on Slabhold",
    );
    assert.equal(
      rankShareText({ username: "@user", percent: -0.082, window: "week" }),
      "@user down 8.2% this week on Slabhold",
    );
    const image = leaderboardRankShareImage({
      username: "مرحبا",
      percent: 0.082,
      window: "day",
    });
    assert.equal(image.imageUrl, null);
    assert.deepEqual(image.photos, []);
    assert.equal(image.detail, ESTIMATED_FROM_SOLD);
    assert.match(read("app/leaderboard/opengraph-image.tsx"), /return renderOg\(/);
    const response = await renderOg(image);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 1000);
  });

  it("shows the closed board, a ranked row, and the sold-price note", () => {
    const closed: LeaderboardModel = {
      today: "2026-10-22",
      dateLabel: "Oct 22",
      monday: false,
      note: LEADERBOARD_NOTE,
      day: { open: false, rows: [], message: LEADERBOARD_CLOSED_COPY },
      week: { open: false, rows: [], message: LEADERBOARD_CLOSED_COPY },
      viewerUserId: null,
    };
    const closedHtml = renderToStaticMarkup(createElement(LeaderboardView, { model: closed }));
    assert.match(closedHtml, /Leaderboard opens when 10 collectors join, opt in/);
    assert.match(closedHtml, /Based on recent sold prices; values update as new sales come in\./);
    assert.doesNotMatch(closedHtml, /investment|returns|eBay data/i);

    const open: LeaderboardModel = {
      ...closed,
      viewerUserId: "ada",
      day: {
        open: true,
        message: null,
        rows: [
          {
            userId: "ada",
            username: "user",
            displayName: "User",
            avatarUrl: null,
            accent: "#7c5cff",
            percent: 0.082,
            delta: 42,
            cardCount: 6,
            percentLabel: "+8.2%",
            deltaLabel: "+$42.00",
          },
        ],
      },
    };
    const html = renderToStaticMarkup(createElement(LeaderboardView, { model: open }));
    assert.match(html, /@user/);
    assert.match(html, /\+8\.2%/);
    assert.match(html, /6 cards/);
    assert.match(html, /@user up 8\.2% today on Slabhold/);
    assert.match(html, /Est\. from recent sold prices/);
    assert.match(html, /Share my rank/);
  });
});

describe("leaderboard wiring", () => {
  it("adds one idempotent migration and does not turn the history flag on in code", () => {
    const sql = read("supabase/migrations/20261023001052_leaderboard_opt_in.sql");
    assert.match(sql, /add column if not exists leaderboard_opt_in boolean not null default false/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = ''/);
    assert.match(sql, /grant execute on function public\.leaderboard_rows\(date, date, integer, numeric\) to anon, authenticated, service_role/);
    assert.match(sql, /is_public is true/);
    assert.match(sql, /is_test/);
    assert.match(sql, /qa_/);
    assert.match(sql, /test_/);
    assert.match(sql, /vreset_/);
    assert.doesNotMatch(sql, /drop table/i);
    assert.equal(cardValueHistoryEnabled({}), false);
    assert.equal(cardValueHistoryEnabled({ CARD_VALUE_HISTORY_ENABLED: "1" }), true);
    const history = read("lib/collection/card-value-history.ts");
    assert.match(history, /CARD_VALUE_HISTORY_ENABLED === "1"/);
  });

  it("schedules the snapshot cron near 11:30 PM New York and keeps the history cron off the schedule", () => {
    const vercel = read("vercel.json");
    assert.match(vercel, /"path": "\/api\/cron\/collection-snapshots"/);
    assert.match(vercel, /"schedule": "30 3 \* \* \*"/);
    assert.doesNotMatch(vercel, /card-value-history/);
    const cron = read("app/api/cron/collection-snapshots/route.ts");
    assert.match(cron, /CRON_SECRET/);
    assert.match(cron, /upsertTodaysCollectionSnapshot/);
    assert.match(cron, /11:30 PM/);
  });

  it("gives leaderboard its own tab and keeps messages in More", () => {
    const shell = read("components/app-shell.tsx");
    const tabs = shell.slice(shell.indexOf("const TABS"), shell.indexOf("] as const;"));
    assert.match(tabs, /Trophy/);
    assert.match(tabs, /href: "\/leaderboard", label: "Leaderboard"/);
    assert.equal(tabs.match(/href:/g)?.length, 5);
    assert.doesNotMatch(tabs, /\/messages/);
    assert.doesNotMatch(tabs, /\/profile/);
    const more = read("components/more-view.tsx");
    assert.match(more, /href="\/messages"/);
    assert.match(more, /href="\/profile"/);
    assert.match(read("components/feed-view.tsx"), /href="\/leaderboard"/);
    assert.match(read("components/privacy-lists.tsx"), /LeaderboardOptInSwitch/);
    assert.match(read("components/dashboard.tsx"), /LeaderboardOptInSwitch/);
    assert.match(read("components/dashboard.tsx"), /LeaderboardPrompt/);
    assert.match(read("lib/leaderboard/load.ts"), /revalidate: LEADERBOARD_CACHE_SECONDS/);
    assert.match(read("lib/leaderboard/load.ts"), /LEADERBOARD_CACHE_SECONDS = 15 \* 60/);
    assert.equal(read("lib/auth/route-access.ts").includes('"/leaderboard"'), true);
  });

  it("keeps investment, returns, and eBay wording out of the board", () => {
    const files = [
      "components/leaderboard-view.tsx",
      "components/leaderboard-opt-in.tsx",
      "app/leaderboard/page.tsx",
      "lib/leaderboard/share.ts",
      "lib/leaderboard/eligibility.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /\binvestment\b/i, file);
      assert.doesNotMatch(source, /\breturns\b/i, file);
      assert.doesNotMatch(source, /eBay data/i, file);
    }
  });
});
