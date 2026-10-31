import assert from "node:assert/strict";
import { createElement } from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { renderOg } from "@/components/og-frame";
import { ValueBoardView } from "@/components/value-board";
import { assembleValueBoard, type ValueBoardSourceCard } from "@/lib/leaderboard/assemble";
import { valueBracketId } from "@/lib/leaderboard/brackets";
import { blockedUserIds, viewerBlockIds, withoutBlocked } from "@/lib/leaderboard/blocks";
import {
  addDaysToYmd,
  currentValueWeek,
  formatSnapshotDate,
  formatWeekLabel,
  isNewYorkMonday,
  leaderboardDates,
  resolveValueWeek,
} from "@/lib/leaderboard/dates";
import { cardIdentity, identityKey } from "@/lib/leaderboard/identity";
import {
  LEADERBOARD_CLOSED_COPY,
  LEADERBOARD_NOTE,
  accountOldEnough,
  isLeaderboardEligible,
  leaderboardMinimums,
  leaderboardOpens,
} from "@/lib/leaderboard/eligibility";
import {
  rankValueBoard,
  valueBoardChange,
  valuePercentLabel,
  type ValueCard,
} from "@/lib/leaderboard/math";
import {
  LEADERBOARD_OPT_IN_HELP,
  LEADERBOARD_OPT_IN_LABEL,
  leaderboardPromptDismissKey,
  leaderboardPromptVisible,
  readLeaderboardOptIn,
  saveLeaderboardOptIn,
  type LeaderboardOptInDb,
} from "@/lib/leaderboard/opt-in";
import { trustedPublicTotals } from "@/lib/leaderboard/public-value";
import { leaderboardChecklist } from "@/lib/leaderboard/requirements";
import { saleSourceIsSelfReported } from "@/lib/leaderboard/self-reported";
import {
  ESTIMATED_FROM_SOLD,
  leaderboardRankShareImage,
  rankShareText,
} from "@/lib/leaderboard/value-share";
import {
  cardSnapshotInsert,
  cardValueSnapshotFields,
  isMissingSnapshotColumn,
  medianOnlySnapshotInsert,
  snapshotSaleSource,
} from "@/lib/leaderboard/snapshot-fields";
import { allowValueBoardRevalidate, shouldFlushAfterOptIn } from "@/lib/leaderboard/revalidate-limit";
import { chosenEndMedian, rowsKeepingPriorIdentity, storedIdentityKey } from "@/lib/leaderboard/snapshot-keep";
import { runOncePerUser } from "@/lib/leaderboard/snapshot-limit";
import { profileChangeRefreshesBoard } from "@/lib/leaderboard/profile-refresh";
import { cardChangeNeedsSnapshot } from "@/lib/leaderboard/snapshot-trigger";
import { buildQueryKey } from "@/lib/comps/query-key";
import { queryKeyCard } from "@/lib/value/price-refresh";
import { VALUE_BOARD_TAB } from "@/lib/leaderboard/tab";
import type { ValueBoardModel } from "@/lib/leaderboard/types";
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

function card(partial: Partial<ValueCard> & Pick<ValueCard, "cardId">): ValueCard {
  return {
    startMedian: 20,
    endMedian: 30,
    startSales: 2,
    endSales: 2,
    selfReported: false,
    openFlag: false,
    ...partial,
  };
}

const NOW = new Date("2026-10-23T16:00:00.000Z");
const OLD_ACCOUNT = "2026-10-01T00:00:00.000Z";
const MINIMUMS = { minCards: 10, minValue: 250, minAccountDays: 7 };

describe("value board math", () => {
  it("caps one card at half the positive gain and labels +100% or more", () => {
    const change = valueBoardChange([
      card({ cardId: "a", startMedian: 20, endMedian: 120, endSales: 3 }),
      card({ cardId: "b", startMedian: 20, endMedian: 40 }),
      card({ cardId: "c", startMedian: 20, endMedian: 30 }),
    ]);
    assert.equal(change.dollarGain, 60);
    assert.equal(change.startSum, 60);
    assert.equal(change.percent, 1);
    assert.equal(change.cardCount, 3);
    assert.equal(valuePercentLabel(change.percent ?? 0), "+100% or more");
    assert.equal(change.flagged, true);
    assert.deepEqual(change.flagReasons, ["single_sale"]);
  });

  it("caps a lone positive card to zero and still flags a single new sale", () => {
    const lone = valueBoardChange([
      card({ cardId: "a", startMedian: 50, endMedian: 150, endSales: 3 }),
    ]);
    assert.equal(lone.percent, 0);
    assert.equal(lone.dollarGain, 0);
    assert.equal(lone.flagged, true);
    assert.deepEqual(lone.flagReasons, ["single_sale"]);
  });

  it("keeps the locked lineup and drops untrusted, cheap, frozen, and duplicate cards", () => {
    const change = valueBoardChange([
      card({ cardId: "kept", startMedian: 20, endMedian: 24 }),
      card({ cardId: "pair", startMedian: 20, endMedian: 24 }),
      card({ cardId: "cheap-start", startMedian: 4.99, endMedian: 20 }),
      card({ cardId: "cheap-end", startMedian: 20, endMedian: 4 }),
      card({ cardId: "few-sales", startSales: 1, endSales: 2 }),
      card({ cardId: "lost-sales", startSales: 2, endSales: 1 }),
      card({ cardId: "flagged", openFlag: true, endMedian: 80 }),
      card({ cardId: "kept", endMedian: 99 }),
      card({ cardId: "blank", startMedian: null, endMedian: 40 }),
    ]);
    assert.equal(change.cardCount, 2);
    assert.equal(change.startSum, 40);
    assert.equal(change.dollarGain, 8);
    assert.equal(change.percent, 0.2);
    assert.equal(change.flagged, false);

    const empty = valueBoardChange([card({ cardId: "flagged", openFlag: true })]);
    assert.equal(empty.percent, null);
    assert.equal(empty.cardCount, 0);
  });

  it("flags a self-reported sale that moved the card up", () => {
    const change = valueBoardChange([
      card({
        cardId: "a",
        startMedian: 20,
        endMedian: 40,
        startSales: 4,
        endSales: 6,
        selfReported: true,
      }),
      card({ cardId: "b", startMedian: 20, endMedian: 30 }),
    ]);
    assert.equal(change.flagged, true);
    assert.deepEqual(change.flagReasons, ["self_reported"]);
    assert.equal(saleSourceIsSelfReported("Self"), true);
    assert.equal(saleSourceIsSelfReported("owner"), true);
    assert.equal(saleSourceIsSelfReported("reported"), true);
    assert.equal(saleSourceIsSelfReported("trawl"), false);
    const reported = {
      median: 12,
      nSales: 2,
      sales: [
        { price: 10, source: "trawl" },
        { price: 14, source: "owner" },
      ],
    } as CardValueResult;
    assert.equal(snapshotSaleSource(reported), "owner");
    assert.deepEqual(cardValueSnapshotFields(reported, snapshotSaleSource(reported)), {
      median: 12,
      n_sales: 2,
      self_reported: true,
    });
    const marketplace = {
      median: 12,
      nSales: 2,
      sales: [{ price: 12, source: "trawl" }],
    } as CardValueResult;
    assert.equal(cardValueSnapshotFields(marketplace, snapshotSaleSource(marketplace)).self_reported, false);
    assert.match(read("lib/collection/totals.ts"), /snapshotSaleSource\(value\)/);
  });

  it("breaks +100% ties by capped dollar gain, then handle", () => {
    const ranked = rankValueBoard([
      { userId: "1", username: "bea", percent: 1.4, dollarGain: 50 },
      { userId: "2", username: "ada", percent: 2, dollarGain: 80 },
      { userId: "3", username: "cy", percent: 0.4, dollarGain: 200 },
      { userId: "5", username: "bea-tie", percent: 0.1, dollarGain: 5 },
      { userId: "4", username: "ada-tie", percent: 0.1, dollarGain: 5 },
    ]);
    assert.deepEqual(
      ranked.map((row) => row.username),
      ["ada", "bea", "cy", "ada-tie", "bea-tie"],
    );
    assert.equal(ranked[0]?.rank, 1);
    assert.equal(valuePercentLabel(-0.082), "−8.2%");
    assert.equal(valuePercentLabel(0.082), "+8.2%");
    assert.equal(valuePercentLabel(-0.0004), "+0.0%");
    assert.equal(valuePercentLabel(0), "+0.0%");
  });

  it("caps duplicate copies by identity and never returns an uncapped percent", () => {
    const copies = valueBoardChange([
      card({ cardId: "copy-a", identityKey: "same", startMedian: 20, endMedian: 120 }),
      card({ cardId: "copy-b", identityKey: "same", startMedian: 20, endMedian: 120 }),
      card({ cardId: "other", identityKey: "other", startMedian: 20, endMedian: 30 }),
    ]);
    assert.equal(copies.cardCount, 3);
    assert.equal(copies.startSum, 60);
    assert.equal(copies.dollarGain, 20);
    assert.equal(copies.percent, 20 / 60);

    const doubled = valueBoardChange([
      card({ cardId: "a", identityKey: "a", startMedian: 20, endMedian: 50 }),
      card({ cardId: "b", identityKey: "b", startMedian: 20, endMedian: 50 }),
    ]);
    assert.equal(doubled.dollarGain, 60);
    assert.equal(doubled.percent, 1);
    assert.equal(valuePercentLabel(doubled.percent ?? 0), "+100% or more");
  });

  it("keeps a card that is untrusted at the end and zeros an identity edit", () => {
    const fell = valueBoardChange([
      card({ cardId: "fell", startMedian: 40, endMedian: 0, endSales: 0, endResolved: true }),
      card({ cardId: "flat", startMedian: 40, endMedian: 40 }),
    ]);
    assert.equal(fell.cardCount, 2);
    assert.equal(fell.percent, -0.5);
    assert.equal(fell.dollarGain, -40);

    const edited = valueBoardChange([
      card({
        cardId: "edited",
        startMedian: 40,
        endMedian: 400,
        endSales: 9,
        identityChanged: true,
      }),
      card({ cardId: "flat", startMedian: 40, endMedian: 40 }),
    ]);
    assert.equal(edited.cardCount, 2);
    assert.equal(edited.percent, 0);
    assert.equal(edited.dollarGain, 0);
    assert.equal(edited.flagged, false);
  });

  it("scores 0 when card number, serial, auto, or qualifier changes", () => {
    const base = {
      playerName: "Ada",
      year: 2020,
      setBrand: "Prizm",
      parallel: "Silver",
      grade: "PSA 10",
    };
    const startKey = identityKey(cardIdentity(base));
    for (const patch of [
      { cardNumber: "9" },
      { serialRun: 1 },
      { isAuto: true },
      { gradeQualifier: "OC" },
    ]) {
      const endKey = identityKey(cardIdentity({ ...base, ...patch }));
      assert.notEqual(startKey, endKey);
      const change = valueBoardChange([
        card({
          cardId: "edited",
          identityKey: startKey,
          startMedian: 30,
          endMedian: 500,
          identityChanged: startKey !== endKey,
        }),
        card({ cardId: "flat", identityKey: "flat", startMedian: 30, endMedian: 30 }),
      ]);
      assert.equal(change.percent, 0);
      assert.equal(change.dollarGain, 0);
    }
    const priced = valueBoardChange([
      card({ cardId: "edited", identityKey: startKey, startMedian: 30, endMedian: 500 }),
      card({ cardId: "other", identityKey: "other", startMedian: 30, endMedian: 60 }),
    ]);
    assert.notEqual(priced.dollarGain, 0);
  });

  it("scores 0 when card number, serial, or auto changes the comps query key", () => {
    const base = {
      id: "card-1",
      playerName: "Ada",
      year: 2020,
      setBrand: "Prizm",
      cardNumber: "1",
      grade: "PSA 10",
      parallel: "Silver",
      serialRun: null as number | null,
      isAuto: false,
    };
    const startKey = buildQueryKey(queryKeyCard(base));
    for (const patch of [{ cardNumber: "9" }, { serialRun: 1 }, { isAuto: true }] as const) {
      const endKey = buildQueryKey(queryKeyCard({ ...base, ...patch }));
      assert.notEqual(startKey, endKey);
      const change = valueBoardChange([
        card({
          cardId: "edited",
          startMedian: 30,
          endMedian: 500,
          identityChanged: startKey !== endKey,
        }),
        card({ cardId: "flat", identityKey: "flat", startMedian: 30, endMedian: 30 }),
      ]);
      assert.equal(change.percent, 0);
      assert.equal(change.dollarGain, 0);
    }
  });

  it("keeps a loss when the card is edited on a later day or the same day", () => {
    const value = (median: number): CardValueResult => ({
      status: "ok",
      median,
      low: median,
      high: median,
      nSales: 3,
      matchedAt: null,
    });
    const row = (date: string, median: number, cardNumber: string) =>
      cardSnapshotInsert({
        cardId: "card-1",
        userId: "user-1",
        snapshotDate: date,
        playerName: "Ada",
        year: 2020,
        setBrand: "Prizm",
        parallel: "Silver",
        grade: "PSA 10",
        cardNumber,
        isPublic: true,
        held: true,
        value: value(median),
      });
    const lineup = (written: ReturnType<typeof row>, median: number) => ({
      snapshotDate: written.snapshot_date,
      median,
      nSales: written.n_sales ?? 0,
      identityKey: storedIdentityKey(written),
      queryKey: written.query_key,
      isPublic: written.is_public,
      status: written.status,
    });
    const start = row("2026-10-18", 100, "1");
    const fallen = row("2026-10-20", 70, "1");
    const renamed = row("2026-10-21", 20, "9");
    const later = chosenEndMedian({
      start: lineup(start, 100),
      snapshots: [lineup(start, 100), lineup(fallen, 70), lineup(renamed, 20)],
      endDate: "2026-10-22",
    });
    assert.equal(later, 70);
    const laterChange = valueBoardChange([
      card({
        cardId: "card-1",
        identityKey: storedIdentityKey(start),
        startMedian: 100,
        endMedian: later,
        endResolved: true,
      }),
    ]);
    assert.equal(laterChange.dollarGain, -30);
    assert.notEqual(laterChange.percent, 0);

    const morning = row("2026-10-21", 70, "1");
    const sameDayEdit = row("2026-10-21", 20, "9");
    assert.equal(rowsKeepingPriorIdentity([morning], [sameDayEdit]).length, 0);
    assert.equal(rowsKeepingPriorIdentity([morning], [row("2026-10-21", 60, "1")]).length, 1);
    const sameDay = chosenEndMedian({
      start: lineup(start, 100),
      snapshots: [lineup(start, 100), lineup(morning, 70)],
      endDate: "2026-10-22",
    });
    assert.equal(sameDay, 70);
    const sameDayChange = valueBoardChange([
      card({
        cardId: "card-1",
        identityKey: storedIdentityKey(start),
        startMedian: 100,
        endMedian: sameDay,
        endResolved: true,
      }),
    ]);
    assert.equal(sameDayChange.dollarGain, -30);
    assert.notEqual(sameDayChange.percent, 0);
  });

  it("scores a card made private mid-week at its last public value", () => {
    const lastPublic = valueBoardChange([
      card({
        cardId: "went-private",
        startMedian: 100,
        endMedian: 110,
        endSales: 2,
        endResolved: true,
      }),
      card({ cardId: "other", startMedian: 100, endMedian: 200 }),
    ]);
    assert.equal(lastPublic.cardCount, 2);
    assert.equal(lastPublic.startSum, 200);
    assert.equal(lastPublic.dollarGain, 20);
    assert.equal(lastPublic.percent, 20 / 200);

    const privateSpike = valueBoardChange([
      card({
        cardId: "went-private",
        startMedian: 100,
        endMedian: 5000,
        endSales: 2,
        endResolved: true,
      }),
      card({ cardId: "other", startMedian: 100, endMedian: 200 }),
    ]);
    assert.equal(privateSpike.dollarGain, 200);
    assert.notEqual(lastPublic.dollarGain, privateSpike.dollarGain);
  });
});

describe("value board brackets", () => {
  function person(index: number): ValueBoardSourceCard[] {
    const end = 20 + index + 1;
    return [0, 1].map((copy) => ({
      ...card({ cardId: `c-${index}-${copy}`, startMedian: 20, endMedian: end }),
      userId: `u-${index}`,
      username: `user${String(index).padStart(2, "0")}`,
      displayName: `User ${index}`,
      avatarUrl: null,
      accent: "#7c5cff",
      bracket: "under-1k" as const,
    }));
  }

  it("places a week-start value and leaves a missing snapshot unbracketed", () => {
    assert.equal(valueBracketId(0), "under-1k");
    assert.equal(valueBracketId(999.99), "under-1k");
    assert.equal(valueBracketId(1000), "1k-10k");
    assert.equal(valueBracketId(9999), "1k-10k");
    assert.equal(valueBracketId(10000), "10k-plus");
    assert.equal(valueBracketId(null), null);
  });

  it("hides a bracket under 10 people and ranks an open bracket without dollar totals", () => {
    const closed = assembleValueBoard(Array.from({ length: 9 }, (_, index) => person(index)).flat());
    const under = closed.find((bracket) => bracket.id === "under-1k");
    assert.equal(under?.open, false);
    assert.deepEqual(under?.rows, []);

    const open = assembleValueBoard(Array.from({ length: 10 }, (_, index) => person(index)).flat());
    const shown = open.find((bracket) => bracket.id === "under-1k");
    assert.equal(shown?.open, true);
    assert.equal(shown?.rows.length, 10);
    assert.equal(shown?.rows[0]?.username, "user09");
    assert.equal("dollarGain" in (shown?.rows[0] ?? {}), false);
    assert.ok((shown?.rows ?? []).every((row) => row.percent <= 1));
    assert.equal(open.every((bracket) => bracket.id !== "1k-10k" || !bracket.open), true);
  });
});

describe("leaderboard eligibility", () => {
  const base = {
    optedIn: true,
    publicCollection: true,
    valuedCards: 10,
    value: 250,
    username: "ada",
    accountCreatedAt: OLD_ACCOUNT,
    now: NOW,
  };

  it("requires a public opted-in book of 10 trusted cards, $250, and 7 days", () => {
    assert.equal(isLeaderboardEligible(base), true);
    assert.equal(isLeaderboardEligible({ ...base, optedIn: false }), false);
    assert.equal(isLeaderboardEligible({ ...base, publicCollection: false }), false);
    assert.equal(isLeaderboardEligible({ ...base, valuedCards: 9 }), false);
    assert.equal(isLeaderboardEligible({ ...base, value: 249.99 }), false);
    assert.equal(isLeaderboardEligible({ ...base, accountCreatedAt: null }), false);
    assert.equal(accountOldEnough("not-a-date", NOW, 7), false);
    assert.equal(
      accountOldEnough(new Date(NOW.getTime() - 6 * 86400000).toISOString(), NOW, 7),
      false,
    );
    assert.equal(
      accountOldEnough(new Date(NOW.getTime() - 7 * 86400000).toISOString(), NOW, 7),
      true,
    );
  });

  it("drops test accounts and only lets the environment raise the floors", () => {
    assert.equal(isLeaderboardEligible({ ...base, isTest: true }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "qa_ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "qa-ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "test_ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "vreset_ada" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "qa_vreset_1021" }), false);
    assert.equal(isLeaderboardEligible({ ...base, username: "slabhold" }), true);

    assert.deepEqual(leaderboardMinimums({}), MINIMUMS);
    assert.deepEqual(
      leaderboardMinimums({
        LEADERBOARD_MIN_CARDS: "12",
        LEADERBOARD_MIN_VALUE: "400",
        LEADERBOARD_MIN_ACCOUNT_DAYS: "14",
      }),
      { minCards: 12, minValue: 400, minAccountDays: 14 },
    );
    assert.deepEqual(
      leaderboardMinimums({
        LEADERBOARD_MIN_CARDS: "1",
        LEADERBOARD_MIN_VALUE: "10",
        LEADERBOARD_MIN_ACCOUNT_DAYS: "1",
      }),
      MINIMUMS,
    );
    assert.deepEqual(
      leaderboardMinimums({
        LEADERBOARD_MIN_CARDS: "999999999",
        LEADERBOARD_MIN_VALUE: "999999999",
        LEADERBOARD_MIN_ACCOUNT_DAYS: "999999999",
      }),
      { minCards: 1000000, minValue: 1000000, minAccountDays: 1000000 },
    );
  });

  it("counts only public held cards with two sales and a median of at least $5", () => {
    const trusted = {
      status: "ok",
      median: 40,
      low: 30,
      high: 50,
      nSales: 2,
      matchedAt: null,
    } satisfies CardValueResult;
    const cards = [
      { id: "public", isPublic: true, sellPrice: null, sellDate: null },
      { id: "private", isPublic: false, sellPrice: null, sellDate: null },
      { id: "sold", isPublic: true, sellPrice: 10, sellDate: "2026-10-01" },
      { id: "thin", isPublic: true, sellPrice: null, sellDate: null },
      { id: "cheap", isPublic: true, sellPrice: null, sellDate: null },
      { id: "stale", isPublic: true, sellPrice: null, sellDate: null },
    ] as SportsCard[];
    const values = new Map<string, CardValueResult>([
      ["public", trusted],
      ["private", trusted],
      ["sold", trusted],
      ["thin", { ...trusted, nSales: 1 }],
      ["cheap", { ...trusted, median: 4.99 }],
      ["stale", { ...trusted, status: "stale" }],
    ]);
    assert.deepEqual(trustedPublicTotals(cards, values), { count: 1, value: 40 });
  });

  it("opens a bracket only at 10 qualifying collections", () => {
    assert.equal(leaderboardOpens(9), false);
    assert.equal(leaderboardOpens(10), true);
    assert.equal(
      LEADERBOARD_CLOSED_COPY,
      "Rankings appear once 10 collectors qualify in a bracket.",
    );
  });

  it("hides people who blocked each other", () => {
    const rows = [{ userId: "ada" }, { userId: "bea" }, { userId: "cy" }];
    assert.deepEqual(
      withoutBlocked(rows, new Set(["bea"])).map((row) => row.userId),
      ["ada", "cy"],
    );
    const hidden = blockedUserIds([["bea"], [{ blocker_id: "cy" }]]);
    assert.deepEqual(
      withoutBlocked(rows, hidden).map((row) => row.userId),
      ["ada"],
    );
    assert.equal(viewerBlockIds([{ error: { message: "nope" }, data: ["ada"] }]), null);
    const fromRpc = viewerBlockIds([{ error: null, data: ["bea", "cy"] }]);
    assert.deepEqual([...(fromRpc ?? [])].sort(), ["bea", "cy"]);
  });
});

describe("leaderboard requirements", () => {
  it("opens the checklist for a signed-in collector who is not on the board yet", () => {
    const checklist = leaderboardChecklist({
      signedIn: true,
      checksReady: true,
      publicCollection: true,
      optedIn: false,
      trustedCards: 3,
      value: 40,
      accountCreatedAt: OLD_ACCOUNT,
      username: "ada",
      now: NOW,
      minimums: MINIMUMS,
    });
    assert.equal(checklist.openByDefault, true);
    assert.equal(checklist.eligible, false);
    assert.equal(checklist.status, null);
    assert.equal(checklist.items.find((item) => item.id === "cards")?.label, "3 of 10 valued cards");
    assert.equal(checklist.items.find((item) => item.id === "cards")?.met, false);
    assert.equal(checklist.items.find((item) => item.id === "opt-in")?.href, "/settings/privacy#show-on-leaderboards");
    assert.match(checklist.line, /at least 10 trusted cards worth \$250/);
    assert.match(checklist.line, /at least 7 days old/);
    assert.match(checklist.sameCardsNote, /same cards over the week/);
  });

  it("says you're on the board once every check is met", () => {
    const checklist = leaderboardChecklist({
      signedIn: true,
      checksReady: true,
      publicCollection: true,
      optedIn: true,
      trustedCards: 10,
      value: 250,
      accountCreatedAt: OLD_ACCOUNT,
      username: "ada",
      now: NOW,
      minimums: MINIMUMS,
    });
    assert.equal(checklist.openByDefault, false);
    assert.equal(checklist.eligible, true);
    assert.equal(checklist.status, "You're on the board");
    assert.equal(checklist.openByDefault, false);
    const thin = leaderboardChecklist({
      signedIn: true,
      checksReady: true,
      publicCollection: true,
      optedIn: true,
      trustedCards: 10,
      value: 250,
      accountCreatedAt: OLD_ACCOUNT,
      username: "ada",
      now: NOW,
      minimums: MINIMUMS,
      boardClosed: true,
    });
    assert.equal(thin.eligible, true);
    assert.equal(thin.openByDefault, true);
  });
});

describe("leaderboard opt-in", () => {
  it("stays off until the owner turns it on, and turning it off removes them", async () => {
    const db = memoryDb(null);
    assert.deepEqual(await readLeaderboardOptIn(db, "ada"), { optedIn: false });
    assert.deepEqual(await saveLeaderboardOptIn(db, "ada", true), { optedIn: true });
    assert.deepEqual(await saveLeaderboardOptIn(db, "ada", false), { optedIn: false });
    assert.equal(LEADERBOARD_OPT_IN_LABEL, "Show me on leaderboards");
    assert.match(LEADERBOARD_OPT_IN_HELP, /Turning this off takes you off the board/);
    assert.equal(leaderboardPromptDismissKey("ada"), "slabhold.leaderboard-prompt.dismissed.ada");
  });

  it("treats a missing column as opted out", async () => {
    const readResult = await readLeaderboardOptIn(memoryDb(null, true), "ada");
    assert.equal(readResult.optedIn, false);
    assert.equal(readResult.error, undefined);
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

describe("value board week and sharing", () => {
  it("uses the Monday–Sunday New York week and keeps yesterday for the snapshot cron", () => {
    const dates = leaderboardDates(new Date("2026-10-22T03:30:00.000Z"));
    assert.equal(dates.today, "2026-10-21");
    assert.equal(dates.yesterday, "2026-10-20");
    assert.equal(dates.weekAgo, "2026-10-14");
    assert.equal(addDaysToYmd("2026-10-22", -7), "2026-10-15");
    assert.equal(formatSnapshotDate("2026-10-22"), "Oct 22");
    assert.equal(isNewYorkMonday(new Date("2026-10-19T16:00:00.000Z")), true);
    assert.deepEqual(currentValueWeek(NOW), { start: "2026-10-18", end: "2026-10-23" });
    assert.deepEqual(currentValueWeek(new Date("2026-10-19T03:00:00.000Z")), {
      start: "2026-10-11",
      end: "2026-10-18",
    });
    assert.deepEqual(resolveValueWeek({ today: "2026-10-19", latest: null }), {
      start: "2026-10-11",
      end: "2026-10-18",
    });
    assert.deepEqual(resolveValueWeek({ today: "2026-10-19", latest: "2026-10-18" }), {
      start: "2026-10-11",
      end: "2026-10-18",
    });
    assert.deepEqual(resolveValueWeek({ today: "2026-10-19", latest: "2026-10-19" }), {
      start: "2026-10-11",
      end: "2026-10-18",
    });
    assert.deepEqual(resolveValueWeek({ today: "2026-10-26", latest: "2026-10-26" }), {
      start: "2026-10-18",
      end: "2026-10-25",
    });
    assert.deepEqual(resolveValueWeek({ today: "2026-10-23", latest: "2026-10-22" }), {
      start: "2026-10-18",
      end: "2026-10-22",
    });
    assert.equal(formatWeekLabel("2026-10-18", "2026-10-23"), "Oct 18–Oct 23");
  });

  it("shares a weekly rank card from sold prices without a team logo", async () => {
    assert.equal(
      rankShareText({ username: "user", percent: 0.082 }),
      "@user up 8.2% this week on Slabhold",
    );
    assert.equal(
      rankShareText({ username: "@user", percent: -0.082 }),
      "@user down 8.2% this week on Slabhold",
    );
    assert.equal(
      rankShareText({ username: "user", percent: 1.2 }),
      "@user up 100% or more this week on Slabhold",
    );
    const image = leaderboardRankShareImage({
      username: "مرحبا",
      percent: 0.082,
    });
    assert.equal(image.imageUrl, null);
    assert.deepEqual(image.photos, []);
    assert.equal(image.detail, ESTIMATED_FROM_SOLD);
    assert.match(read("app/(app)/leaderboard/value/opengraph-image.tsx"), /return renderOg\(/);
    const response = await renderOg(image);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 1000);
  });

  it("shows percents, a flag, and the requirements without a dollar total", () => {
    const checklist = leaderboardChecklist({
      signedIn: true,
      checksReady: true,
      publicCollection: false,
      optedIn: false,
      trustedCards: 3,
      value: 40,
      accountCreatedAt: OLD_ACCOUNT,
      username: "ada",
      now: NOW,
      minimums: MINIMUMS,
    });
    const model: ValueBoardModel = {
      start: "2026-10-19",
      end: "2026-10-23",
      weekLabel: "Oct 19–Oct 23",
      note: LEADERBOARD_NOTE,
      closedMessage: LEADERBOARD_CLOSED_COPY,
      emptyMessage: null,
      brackets: [
        {
          id: "under-1k",
          label: "Under $1,000",
          rows: [
            {
              userId: "ada",
              username: "user",
              displayName: "User",
              avatarUrl: null,
              accent: "#7c5cff",
              percent: 0.082,
              percentLabel: "+8.2%",
              flagged: true,
              rank: 1,
            },
          ],
        },
      ],
      viewerUserId: "ada",
    };
    const html = renderToStaticMarkup(createElement(ValueBoardView, { model, checklist }));
    assert.match(html, /Rankings appear once 10 collectors qualify in a bracket\./);
    assert.match(html, /Based on recent sold prices; values update as new sales come in\./);
    assert.match(html, /How to get on the leaderboard/);
    assert.match(html, /3 of 10 valued cards/);
    assert.match(html, /href="\/settings\/privacy#show-on-leaderboards"/);
    assert.match(html, /@user/);
    assert.match(html, /\+8\.2%/);
    assert.match(html, /Flagged/);
    assert.match(html, /Est\. from recent sold prices/);
    assert.doesNotMatch(html, /\+\$|\$42|6 cards/);
    assert.doesNotMatch(html, /investment|returns|eBay data/i);
    assert.match(html, /open=""/);
  });
});

describe("leaderboard wiring", () => {
  it("adds one idempotent migration and does not turn the history flag on in code", () => {
    const sql = read("supabase/migrations/20261023011000_leaderboard_opt_in.sql");
    assert.match(sql, /add column if not exists leaderboard_opt_in boolean not null default false/);
    assert.match(sql, /add column if not exists n_sales integer/);
    assert.match(sql, /add column if not exists self_reported boolean not null default false/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = ''/);
    assert.doesNotMatch(sql, /collection_snapshots/);
    assert.doesNotMatch(sql, /pg_catalog/);
    assert.match(sql, /left join lateral/);
    assert.match(sql, /pv\.value < 1000 then 'under-1k'/);
    assert.match(sql, /least\(coalesce\(p_as_of, now\(\)\), now\(\)\)/);
    assert.match(
      sql,
      /Bracket comes from the week-start value of public held cards only/,
    );
    assert.match(
      sql,
      /revoke execute on function public\.leaderboard_rows\(date, date, integer, numeric, integer, timestamptz\) from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function public\.leaderboard_rows\(date, date, integer, numeric, integer, timestamptz\) to service_role;/,
    );
    assert.doesNotMatch(sql, /to anon, authenticated/);
    assert.match(sql, /drop function if exists public\.blocked_by_ids\(\)/);
    assert.match(sql, /function public\.leaderboard_hidden_ids\(p_viewer uuid\)/);
    assert.match(sql, /returns setof uuid/);
    assert.match(sql, /where b\.blocker_id = p_viewer/);
    assert.match(sql, /where b\.blocked_id = p_viewer/);
    assert.match(
      sql,
      /revoke all on function public\.leaderboard_hidden_ids\(uuid\) from public, anon, authenticated;/,
    );
    assert.match(
      sql,
      /grant execute on function public\.leaderboard_hidden_ids\(uuid\) to service_role;/,
    );
    assert.doesNotMatch(sql, /grant execute on function public\.blocked_by_ids/);
    assert.match(sql, /card_value_snapshots_date_idx/);
    assert.match(sql, /p_card_number text/);
    assert.match(sql, /p_serial_run text/);
    assert.match(sql, /p_is_auto boolean/);
    assert.match(sql, /p_is_relic boolean/);
    assert.match(sql, /p_grade_qualifier text/);
    assert.match(sql, /p_year_label text/);
    assert.match(sql, /p_condition_type text/);
    assert.match(sql, /add column if not exists query_key text/);
    assert.match(sql, /s\.query_key is not distinct from start_snap\.query_key/);
    assert.match(sql, /coalesce\(end_snap\.median, start_snap\.median\)/);
    assert.match(sql, /card_value_snapshot_keep_identity/);
    assert.match(sql, /before update on public\.card_value_snapshots/);
    assert.match(sql, /return null;/);
    assert.match(sql, /is_public is true/);
    assert.match(sql, /is_test/);
    assert.match(sql, /qa_/);
    assert.match(sql, /test_/);
    assert.match(sql, /vreset_/);
    assert.match(sql, /comp_flags/);
    assert.match(sql, /snapshot_date = p_start/);
    assert.match(sql, /pv\.value < 10000 then '1k-10k'/);
    assert.match(sql, /greatest\(coalesce\(p_min_cards, 10\), 10\)/);
    assert.match(sql, /greatest\(coalesce\(p_min_value, 250\), 250\)/);
    assert.match(sql, /p_min_account_days/);
    assert.doesNotMatch(sql, /drop table/i);
    assert.match(sql, /protect_profile_created_at/);
    assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/);
    assert.match(sql, /new\.created_at := old\.created_at/);
    assert.match(sql, /join auth\.users u on u\.id = p\.id/);
    assert.match(sql, /u\.created_at <= least\(coalesce\(p_as_of, now\(\)\), now\(\)\)/);
    assert.match(sql, /on delete set null/);
    assert.match(sql, /card_key/);
    assert.match(sql, /status in \('ok', 'sample'\)/);
    assert.match(sql, /s\.held is true/);
    assert.match(sql, /f\.user_id is distinct from e\.id/);
    assert.match(sql, /f\.created_at < \(p_start \+ interval '1 day'\)/);
    assert.match(sql, /comp_flags_card_id_idx/);
    assert.match(sql, /1000000/);
    assert.match(sql, /= start_snap\.identity_key/);
    assert.match(sql, /coalesce\(end_snap\.median, start_snap\.median\)/);
    const fn = sql.slice(
      sql.indexOf("function public.leaderboard_rows"),
      sql.indexOf("comment on function public.leaderboard_rows"),
    );
    assert.doesNotMatch(fn, /join public\.cards/);
    assert.doesNotMatch(fn, /p\.created_at/);
    const opted = fn.slice(fn.indexOf("with opted as ("), fn.indexOf("lineup as ("));
    assert.match(opted, /p_start is not null/);
    assert.match(opted, /p_end is not null/);
    assert.match(opted, /p_end >= p_start/);
    const chosenEnd = fn.slice(fn.indexOf("chosen_end as ("), fn.indexOf("from eligible e"));
    assert.match(chosenEnd, /and s\.is_public is true/);
    assert.match(sql, /card_value_snapshots_card_id_date_idx/);
    assert.match(
      sql,
      /create unique index if not exists card_value_snapshots_card_id_date_idx\n  on public\.card_value_snapshots \(card_id, snapshot_date\);/,
    );
    assert.match(sql, /new\.card_key := coalesce\(new\.card_key, new\.card_id\)/);
    assert.match(sql, /before insert on public\.card_value_snapshots/);
    assert.match(
      sql,
      /revoke all on function public\.card_value_snapshot_defaults\(\) from public, anon, authenticated;/,
    );
    assert.match(sql, /references auth\.users \(id\) on delete cascade/);
    assert.match(sql, /last public trusted value/);
    assert.match(read("supabase/schema.sql"), /function public\.card_snapshot_identity/);
    const identity = cardIdentity({
      playerName: "Ada",
      year: 2020,
      setBrand: "Prizm",
      parallel: "Silver",
      grade: "PSA 10",
    });
    assert.equal(identityKey(identity), "ada|2020||prizm|silver|10|psa|||0|0||");
    const numbered = cardIdentity({
      playerName: "Ada",
      year: 2020,
      yearLabel: "2020-21",
      setBrand: "Prizm",
      parallel: "Silver",
      grade: "PSA 10",
      cardNumber: "#47",
      serialRun: 99,
      isAuto: true,
      isRelic: false,
      gradeQualifier: "OC",
      conditionType: "graded",
    });
    assert.equal(
      identityKey(numbered),
      "ada|2020|2020-21|prizm|silver|10|psa|47|99|1|0|oc|graded",
    );
    assert.equal(isMissingSnapshotColumn({ code: "42703", message: "column card_key does not exist" }), true);
    assert.equal(isMissingSnapshotColumn({ code: "PGRST204", message: "schema cache" }), true);
    assert.equal(isMissingSnapshotColumn({ code: "23505", message: "duplicate" }), false);
    const row = cardSnapshotInsert({
      cardId: "card-1",
      userId: "user-1",
      snapshotDate: "2026-10-23",
      playerName: "Ada",
      year: 2020,
      setBrand: "Prizm",
      parallel: "Silver",
      grade: "PSA 10",
      isPublic: true,
      held: true,
      value: { status: "ok", median: 40, low: 30, high: 50, nSales: 2, matchedAt: null },
      saleSource: "owner",
    });
    assert.equal(row.card_key, "card-1");
    assert.equal(row.self_reported, true);
    assert.equal(row.status, "ok");
    assert.equal(row.held, true);
    assert.equal(row.player, "ada");
    assert.equal(
      row.query_key,
      buildQueryKey(
        queryKeyCard({
          id: "card-1",
          year: 2020,
          setBrand: "Prizm",
          parallel: "Silver",
          grade: "PSA 10",
        }),
      ),
    );
    assert.deepEqual(medianOnlySnapshotInsert(row), {
      card_id: "card-1",
      snapshot_date: "2026-10-23",
      median: 40,
    });
    assert.equal(cardValueHistoryEnabled({}), false);
    assert.equal(cardValueHistoryEnabled({ CARD_VALUE_HISTORY_ENABLED: "1" }), true);
    const history = read("lib/collection/card-value-history.ts");
    assert.match(history, /CARD_VALUE_HISTORY_ENABLED === "1"/);
  });

  it("returns no rows for null or reversed dates and ignores a private mid-week value", () => {
    const sql = read("supabase/migrations/20261023011000_leaderboard_opt_in.sql");
    const fn = sql.slice(
      sql.indexOf("function public.leaderboard_rows"),
      sql.indexOf("comment on function public.leaderboard_rows"),
    );
    const opted = fn.slice(fn.indexOf("with opted as ("), fn.indexOf("lineup as ("));
    assert.match(opted, /and p_start is not null\n\s+and p_end is not null\n\s+and p_end >= p_start/);
    const chosenEnd = fn.slice(fn.indexOf("chosen_end as ("), fn.indexOf("from eligible e"));
    assert.match(chosenEnd, /and s\.snapshot_date <= p_end\n\s+and s\.is_public is true/);
    assert.doesNotMatch(chosenEnd, /is_public is false/);
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
    assert.match(cron, /status: failed > 0 \? 500 : 200/);
    assert.match(read("lib/collection/totals.ts"), /isMissingSnapshotColumn/);
    assert.match(read("lib/collection/totals.ts"), /onConflict: "card_id,snapshot_date"/);
    assert.match(read("lib/collection/totals.ts"), /snapshotDateInNewYork\(\)/);
  });

  it("ships the value board as its own route and leaves the nav tab to the weekly frame", async () => {
    // The bottom nav keeps the weekly /leaderboard tab; the Value board is not a tab.
    const nav = read("lib/ui/bottom-nav.ts");
    const tabs = nav.slice(nav.indexOf("export const BOTTOM_NAV ="), nav.indexOf("] as const;"));
    assert.doesNotMatch(tabs, /\/leaderboard\/value/);
    assert.match(tabs, /href: "\/messages"/);
    assert.doesNotMatch(read("components/feed-view.tsx"), /\/leaderboard\/value/);
    assert.match(read("components/privacy-lists.tsx"), /LeaderboardOptInSwitch/);
    assert.match(read("components/dashboard.tsx"), /LeaderboardOptInSwitch/);
    assert.match(read("components/dashboard.tsx"), /LeaderboardPrompt/);
    const load = read("lib/leaderboard/value-load.ts");
    assert.match(load, /revalidate: LEADERBOARD_CACHE_SECONDS/);
    assert.match(load, /LEADERBOARD_CACHE_SECONDS = 15 \* 60/);
    assert.match(load, /VALUE_BOARD_CACHE_TAG/);
    assert.match(load, /resolveValueWeek/);
    assert.match(load, /\.lt\("snapshot_date", today\)/);
    assert.doesNotMatch(load, /\.lte\("snapshot_date"/);
    assert.match(read("components/leaderboard-opt-in.tsx"), /setLeaderboardOptIn/);
    assert.doesNotMatch(read("components/leaderboard-opt-in.tsx"), /revalidateValueBoard/);
    const optInAction = read("lib/leaderboard/revalidate.ts");
    assert.match(optInAction, /getAuthUserId\(\)/);
    assert.match(optInAction, /shouldFlushAfterOptIn/);
    assert.match(optInAction, /allowValueBoardRevalidate/);
    assert.match(optInAction, /saveLeaderboardOptIn/);
    assert.doesNotMatch(optInAction, /export async function revalidateValueBoard\(/);
    assert.match(optInAction, /export async function revalidateValueBoardForAccount/);
    const rateAt = 1_700_000_000_000;
    assert.equal(allowValueBoardRevalidate("rate-ada", rateAt), true);
    assert.equal(allowValueBoardRevalidate("rate-ada", rateAt + 5_000), false);
    assert.equal(allowValueBoardRevalidate("rate-ada", rateAt + 10_000), true);
    assert.equal(shouldFlushAfterOptIn(false, "opt-ada", rateAt), true);
    assert.equal(shouldFlushAfterOptIn(false, "opt-ada", rateAt + 1_000), true);
    assert.equal(shouldFlushAfterOptIn(true, "opt-ada", rateAt + 1_000), true);
    assert.equal(shouldFlushAfterOptIn(true, "opt-ada", rateAt + 2_000), false);
    const edit = {
      id: "card-1",
      playerName: "Ada",
      year: 2020,
      setBrand: "Prizm",
      cardNumber: "1",
      grade: "PSA 10",
      parallel: "Silver",
    };
    assert.equal(cardChangeNeedsSnapshot(edit, edit), false);
    assert.equal(cardChangeNeedsSnapshot(edit, { ...edit, cardNumber: "2" }), true);
    assert.equal(
      cardChangeNeedsSnapshot({ ...edit, isPublic: true }, { ...edit, isPublic: false }),
      true,
    );
    assert.equal(
      cardChangeNeedsSnapshot(edit, { ...edit, sellPrice: 12, sellDate: "2026-10-23" }),
      true,
    );
    assert.match(read("components/collection-provider.tsx"), /snapshotOwnedCollection\(\)/);
    assert.match(read("components/collection-provider.tsx"), /pendingDeletes/);
    assert.match(read("components/collection-provider.tsx"), /queueMicrotask/);
    assert.match(read("lib/leaderboard/snapshot-before.ts"), /runOncePerUser/);
    assert.match(read("lib/collection/totals.ts"), /rowsKeepingPriorIdentity/);
    let snapshots = 0;
    await Promise.all([
      runOncePerUser("bulk-ada", async () => { snapshots += 1; }, rateAt),
      runOncePerUser("bulk-ada", async () => { snapshots += 1; }, rateAt),
      runOncePerUser("bulk-ada", async () => { snapshots += 1; }, rateAt),
    ]);
    assert.equal(snapshots, 1);
    assert.match(read("components/collection-provider.tsx"), /cardChangeNeedsSnapshot\(previous, updated\)/);
    assert.match(read("app/api/cron/refresh-card-values/route.ts"), /snapshotOwnersAfterRefresh/);
    assert.match(read("lib/account/delete-account.ts"), /"card_value_snapshots", "user_id"/);
    assert.match(read("app/api/account/delete/route.ts"), /flushValueBoardCache/);
    assert.match(read("components/social-provider.tsx"), /revalidateValueBoardForAccount/);
    assert.match(read("components/social-provider.tsx"), /profileChangeRefreshesBoard/);
    assert.doesNotMatch(read("components/social-provider.tsx"), /afterTestFlag/);
    const sameProfile = {
      beforeUsername: "ada",
      afterUsername: "ada",
      beforeAvatar: "pic",
      afterAvatar: "pic",
      beforeTestFlag: false,
      afterTestFlag: false,
    };
    assert.equal(profileChangeRefreshesBoard(sameProfile), false);
    assert.equal(profileChangeRefreshesBoard({ ...sameProfile, afterUsername: "ada2" }), true);
    assert.equal(profileChangeRefreshesBoard({ ...sameProfile, afterAvatar: "new" }), true);
    assert.equal(profileChangeRefreshesBoard({ ...sameProfile, afterTestFlag: true }), true);
    assert.equal(profileChangeRefreshesBoard({ ...sameProfile, afterUsername: "qa_ada" }), true);
    // A snapshot whose card was deleted keeps card_id null; the history reader skips it.
    assert.match(read("lib/collection/card-value-history-run.ts"), /typeof row\.card_id === "string"/);
    assert.match(read("app/(app)/leaderboard/value/page.tsx"), /getAuthUserCreatedAt/);
    assert.match(read("components/value-board.tsx"), /accountCreatedAt/);
    assert.equal(existsSync(join(process.cwd(), "app/(app)/leaderboard/value/loading.tsx")), true);
    assert.equal(existsSync(join(process.cwd(), "app/(app)/leaderboard/value/error.tsx")), true);
    assert.match(load, /return createSupabaseAdmin\(\)/);
    assert.doesNotMatch(load, /anonKey|createClient\(/);
    assert.match(load, /leaderboard_hidden_ids/);
    assert.match(load, /p_viewer: viewerId/);
    assert.match(load, /\[leaderboard\] block lists failed/);
    assert.match(load, /hidden == null/);
    assert.doesNotMatch(load, /hidden_author_ids|blocked_by_ids/);
    const cachedRead = load.slice(
      load.indexOf("async function readPublicValueBoard"),
      load.indexOf("export async function getPublicValueBoard"),
    );
    assert.doesNotMatch(cachedRead, /leaderboard_hidden_ids|hidden_author_ids|blocked_by_ids/);
    const viewerRead = load.slice(load.indexOf("export async function getValueBoard"));
    assert.match(viewerRead, /getPublicValueBoard\(input\)/);
    assert.match(viewerRead, /hiddenIds\(viewerUserId\)/);
    assert.match(read("components/dashboard.tsx"), /trustedPublicTotals\(cards, values\)/);
    assert.match(read("components/value-board.tsx"), /trustedPublicTotals\(cards, values\)/);
    const schema = read("supabase/schema.sql");
    const schemaFn = schema.slice(schema.indexOf("function public.leaderboard_rows"));
    assert.match(schemaFn, /left join lateral/);
    assert.match(schemaFn, /Bracket comes from the week-start value of public held cards only/);
    assert.match(schemaFn, /function public\.leaderboard_hidden_ids\(p_viewer uuid\)/);
    assert.match(schemaFn, /s\.card_number/);
    assert.match(schemaFn, /s\.query_key/);
    assert.match(schemaFn, /s\.query_key is not distinct from start_snap\.query_key/);
    assert.match(schemaFn, /coalesce\(end_snap\.median, start_snap\.median\)/);
    assert.match(schema, /card_value_snapshot_keep_identity/);
    assert.doesNotMatch(schemaFn, /function public\.blocked_by_ids/);
    assert.match(schemaFn, /auth\.users/);
    assert.match(schemaFn, /s\.is_public is true/);
    assert.match(schemaFn, /s\.held is true/);
    assert.match(schemaFn, /p_end >= p_start/);
    const schemaChosen = schemaFn.slice(
      schemaFn.indexOf("chosen_end as ("),
      schemaFn.indexOf("from eligible e"),
    );
    assert.match(schemaChosen, /and s\.is_public is true/);
    assert.doesNotMatch(schemaFn, /collection_snapshots/);
    assert.doesNotMatch(schemaFn, /join public\.cards/);
    assert.equal(read("lib/auth/route-access.ts").includes('"/leaderboard/value"'), true);
    assert.equal(VALUE_BOARD_TAB.id, "value");
    assert.equal(existsSync(join(process.cwd(), "app/(app)/leaderboard/value/page.tsx")), true);
    assert.equal(existsSync(join(process.cwd(), "app/leaderboard/page.tsx")), false);
  });

  it("keeps investment, returns, and eBay wording out of the board", () => {
    const files = [
      "components/value-board.tsx",
      "components/leaderboard-opt-in.tsx",
      "app/(app)/leaderboard/value/page.tsx",
      "lib/leaderboard/value-share.ts",
      "lib/leaderboard/eligibility.ts",
      "lib/leaderboard/requirements.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /\binvestment\b/i, file);
      assert.doesNotMatch(source, /\breturns\b/i, file);
      assert.doesNotMatch(source, /eBay data/i, file);
    }
  });
});
