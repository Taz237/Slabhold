import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleMovingToday, type PublicCardRef, type RawCompSale } from "./present";
import { isMovingTodaySale, shouldShowMovingToday, type MovingTodayPayload, type MovingTodaySale } from "./types";
import {
  addCalendarDays,
  BIG_MOVE_PERCENT,
  calendarDateInTimeZone,
  comparisonPricesCents,
  dropOwnerFlaggedSales,
  HONEST_MIN_COMPARISON_SALES,
  MOVERS_CAP,
  MOVING_THIS_WEEK_TITLE,
  MOVING_TODAY_MIN_DAY_MOVERS,
  MOVING_TODAY_MIN_DAY_ROWS,
  MOVING_TODAY_MIN_LEAD_CENTS,
  MOVING_FRESH_DAYS,
  MOVING_FULL_ROW,
  MOVING_MONTH_DAYS,
  MOVING_PUBLIC_CAP,
  MOVING_RAIL_MAX,
  MOVING_STRIP_MODE,
  MOVING_TODAY_WEEK_DAYS,
  freshenMovingToday,
  movingDayHeading,
  movingDayIsRecent,
  movingTodayDescription,
  weekDateLabel,
  newYorkDayWindow,
  percentVersusRecentAverage,
  rankMovers,
  rankNotableSales,
  saleCalendarDate,
  splitMovers,
  toSaleRecord,
  type SaleRecord,
} from "./rank";

const TODAY = "2026-10-22";
const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

function record(input: {
  queryKey: string;
  priceCents: number;
  soldOn?: string;
  itemId?: string;
  cardId?: string;
}): SaleRecord {
  return {
    queryKey: input.queryKey,
    cardId: input.cardId ?? CARD,
    itemId: input.itemId ?? `${input.queryKey}-item`,
    priceCents: input.priceCents,
    soldOn: input.soldOn ?? TODAY,
  };
}

function prices(cents: number[]): SaleRecord[] {
  return cents.map((priceCents, index) =>
    record({
      queryKey: "same",
      priceCents,
      soldOn: addCalendarDays(TODAY, -(index + 1)),
      itemId: `prior-${index}`,
    }),
  );
}

describe("honest percent versus recent average", () => {
  it("uses the mean of at least three earlier sales", () => {
    assert.equal(HONEST_MIN_COMPARISON_SALES, 3);
    const percent = percentVersusRecentAverage(15_000, [10_000, 12_000, 8_000]);
    assert.equal(percent, 50);
  });

  it("skips the percent when fewer than three comparison sales exist", () => {
    assert.equal(percentVersusRecentAverage(15_000, [10_000, 12_000]), null);
    assert.equal(percentVersusRecentAverage(15_000, [10_000]), null);
    assert.equal(percentVersusRecentAverage(15_000, []), null);
  });

  it("ignores non-positive prices before deciding the sample is too small", () => {
    assert.equal(percentVersusRecentAverage(15_000, [10_000, 12_000, 0, -5]), null);
  });

  it("rounds half up to the big-move line and keeps a 19 point move off it", () => {
    assert.equal(percentVersusRecentAverage(11_950, [10_000, 10_000, 10_000]), 20);
    assert.equal(percentVersusRecentAverage(11_949, [10_000, 10_000, 10_000]), 19);
    assert.equal(BIG_MOVE_PERCENT, 20);
  });

  it("keeps a down move signed", () => {
    assert.equal(percentVersusRecentAverage(8_000, [10_000, 10_000, 10_000]), -20);
  });

  it("excludes the sale itself, same-day sales, and sales older than 90 days", () => {
    const sale = record({ queryKey: "card", priceCents: 20_000, itemId: "today-1" });
    const history = [
      record({ queryKey: "card", priceCents: 10_000, itemId: "prior", soldOn: addCalendarDays(TODAY, -1) }),
      record({ queryKey: "card", priceCents: 10_000, itemId: "same-day", soldOn: TODAY }),
      record({ queryKey: "card", priceCents: 1, itemId: "old", soldOn: addCalendarDays(TODAY, -91) }),
      record({ queryKey: "card", priceCents: 11_000, itemId: "a", soldOn: addCalendarDays(TODAY, -2) }),
      record({ queryKey: "card", priceCents: 12_000, itemId: "b", soldOn: addCalendarDays(TODAY, -3) }),
      record({ queryKey: "card", priceCents: 13_000, itemId: "b", soldOn: addCalendarDays(TODAY, -4) }),
      record({ queryKey: "other", priceCents: 1, itemId: "x", soldOn: addCalendarDays(TODAY, -1) }),
    ];
    const comparison = comparisonPricesCents(sale, history, TODAY);
    assert.deepEqual(comparison.sort((a, b) => a - b), [10_000, 11_000, 13_000]);
  });
});

describe("notable sales ranking", () => {
  it("lists the biggest sales, then other big moves, one row per card", () => {
    const sales = [
      record({ queryKey: "wemby", priceCents: 200_000, itemId: "w-big" }),
      record({ queryKey: "wemby", priceCents: 10_000, itemId: "w-small" }),
      record({ queryKey: "judge", priceCents: 150_000, itemId: "j" }),
      record({ queryKey: "giannis", priceCents: 90_000, itemId: "g" }),
      record({ queryKey: "luka", priceCents: 8_000, itemId: "l" }),
      record({ queryKey: "booker", priceCents: 5_000, itemId: "b" }),
      record({ queryKey: "dame", priceCents: 3_000, itemId: "d" }),
      record({ queryKey: "tatum", priceCents: 4_000, itemId: "t" }),
      record({ queryKey: "yesterday", priceCents: 900_000, itemId: "y", soldOn: addCalendarDays(TODAY, -1) }),
      record({ queryKey: "empty", priceCents: 800_000, itemId: "__empty__" }),
    ];
    const history = [
      ...prices([100_000, 100_000, 100_000]).map((row) => ({ ...row, queryKey: "wemby" })),
      ...prices([4_000, 4_000, 4_000]).map((row) => ({ ...row, queryKey: "luka" })),
      ...prices([4_000, 4_000, 4_000]).map((row) => ({ ...row, queryKey: "booker" })),
      ...prices([1_000, 1_000, 1_000]).map((row) => ({ ...row, queryKey: "dame" })),
      ...[100, 100].map((priceCents, index) =>
        record({
          queryKey: "giannis",
          priceCents,
          itemId: `thin-${index}`,
          soldOn: addCalendarDays(TODAY, -(index + 1)),
        }),
      ),
      ...prices([3_361, 3_361, 3_361]).map((row) => ({ ...row, queryKey: "tatum" })),
    ];
    const ranked = rankNotableSales({ today: TODAY, sales, history });
    assert.deepEqual(
      ranked.map((sale) => sale.queryKey),
      ["wemby", "judge", "giannis", "dame", "luka", "booker"],
    );
    assert.equal(ranked[0]?.itemId, "w-big");
    assert.equal(ranked[0]?.percent, 100);
    assert.equal(ranked[1]?.percent, null);
    assert.equal(ranked[2]?.percent, null);
    assert.equal(ranked[3]?.percent, 200);
    assert.equal(ranked[4]?.percent, 100);
    assert.equal(ranked[5]?.percent, 25);
    assert.equal(ranked.some((sale) => sale.queryKey === "tatum"), false);
    assert.equal(ranked.some((sale) => sale.soldOn !== TODAY), false);
  });

  it("returns nothing when today has no sales", () => {
    const ranked = rankNotableSales({
      today: TODAY,
      sales: [record({ queryKey: "old", priceCents: 50_000, soldOn: addCalendarDays(TODAY, -1) })],
      history: [],
    });
    assert.deepEqual(ranked, []);
  });
});

describe("New York sale day", () => {
  it("uses the New York calendar date and UTC midnight bounds", () => {
    const afternoon = newYorkDayWindow(new Date("2026-10-22T19:00:00.000Z"));
    assert.equal(afternoon.date, "2026-10-22");
    assert.equal(afternoon.startIso, "2026-10-22T00:00:00Z");
    assert.equal(afternoon.endIso, "2026-10-23T00:00:00Z");
    assert.equal(newYorkDayWindow(new Date("2026-10-22T03:30:00.000Z")).date, "2026-10-21");
    const winter = newYorkDayWindow(new Date("2026-01-15T12:00:00.000Z"));
    assert.equal(winter.date, "2026-01-15");
    assert.equal(winter.startIso, "2026-01-15T00:00:00Z");
  });

  it("shows a midnight-UTC sale on that calendar date at 3pm Eastern", () => {
    const now = new Date("2026-10-22T19:00:00.000Z");
    assert.equal(calendarDateInTimeZone(now), "2026-10-22");
    const soldAt = "2026-10-22T00:00:00+00:00";
    assert.equal(saleCalendarDate(soldAt), "2026-10-22");
    assert.equal(saleCalendarDate("2026-10-22"), "2026-10-22");
    const sale = toSaleRecord({
      queryKey: "wemby",
      cardId: CARD,
      itemId: "midnight",
      price: 200,
      soldAt,
    });
    assert.equal(sale?.soldOn, "2026-10-22");
    const ranked = rankNotableSales({
      today: calendarDateInTimeZone(now),
      sales: sale ? [sale] : [],
      history: [],
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.itemId, "midnight");
    assert.equal(ranked[0]?.soldOn, "2026-10-22");
  });

  it("computes the percent from three earlier date-only sales", () => {
    const sale = toSaleRecord({
      queryKey: "wemby",
      cardId: CARD,
      itemId: "today",
      price: 150,
      soldAt: "2026-10-22T00:00:00+00:00",
    });
    const history = [100, 120, 80].map((price, index) => {
      const soldOn = addCalendarDays(TODAY, -(index + 1));
      return toSaleRecord({
        queryKey: "wemby",
        cardId: CARD,
        itemId: `prior-${index}`,
        price,
        soldAt: `${soldOn}T00:00:00+00:00`,
      });
    }).filter((row): row is SaleRecord => row != null);
    assert.equal(history.length, 3);
    assert.deepEqual(history.map((row) => row.soldOn), ["2026-10-21", "2026-10-20", "2026-10-19"]);
    const ranked = rankNotableSales({
      today: TODAY,
      sales: sale ? [sale] : [],
      history,
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.percent, 50);
  });

  it("keeps the day and week thresholds and the honest headings", () => {
    assert.equal(MOVING_TODAY_WEEK_DAYS, 7);
    assert.equal(MOVING_TODAY_MIN_DAY_ROWS, 5);
    assert.equal(MOVING_TODAY_MIN_DAY_MOVERS, 6);
    assert.equal(MOVING_FULL_ROW, 6);
    assert.equal(MOVING_MONTH_DAYS, 30);
    assert.equal(MOVING_RAIL_MAX, 12);
    assert.equal(MOVING_FRESH_DAYS, 14);
    assert.equal(MOVING_PUBLIC_CAP, 300);
    assert.equal(MOVING_STRIP_MODE, "all-public");
    assert.equal(MOVERS_CAP, 60);
    assert.equal(MOVING_TODAY_MIN_LEAD_CENTS, 500);
    assert.equal(movingDayHeading(TODAY, TODAY), "Moving today");
    assert.equal(movingDayHeading(addCalendarDays(TODAY, -1), TODAY), "Moving yesterday");
    assert.equal(movingDayHeading(addCalendarDays(TODAY, -2), TODAY), "Moving Oct 20");
    assert.equal(weekDateLabel(TODAY), "Oct 16 – Oct 22");
    assert.equal(movingDayIsRecent(addCalendarDays(TODAY, -6), TODAY), true);
    assert.equal(movingDayIsRecent(addCalendarDays(TODAY, -7), TODAY), false);
    assert.equal(
      movingTodayDescription(MOVING_THIS_WEEK_TITLE),
      "This week's notable sales across the Slabhold catalog.",
    );
    assert.equal(
      movingTodayDescription("Moving today"),
      "Today's notable sales across the Slabhold catalog.",
    );
  });
});

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function mover(n: number, partial: Partial<MovingTodaySale> = {}): MovingTodaySale {
  return {
    kind: "mover",
    cardId: id(n),
    href: `/u/ada/cards/${id(n)}`,
    player: `Player ${n}`,
    detail: "2023-24 · Prizm · PSA 10",
    yearLabel: "2023-24",
    setBrand: "Prizm",
    grade: "PSA 10",
    grader: "PSA",
    conditionType: "graded",
    isRookie: false,
    imageUrl: null,
    accent: "#7c5cff",
    priceCents: 2500,
    priceLabel: "$25.00",
    soldOn: TODAY,
    soldLabel: "Oct 22",
    percent: 20,
    percentLabel: "+20%",
    ...partial,
  };
}

describe("movers", () => {
  it("keeps only real percents, one row per card, biggest move first, capped at 60", () => {
    const rows = [
      mover(1, { percent: 12 }),
      mover(2, { percent: -45 }),
      mover(3, { percent: null, percentLabel: null, priceCents: 900_000 }),
      mover(4, { percent: 0, percentLabel: "0%" }),
      mover(5, { percent: 115 }),
      mover(5, { percent: 3, priceCents: 100 }),
    ];
    const ranked = rankMovers(rows);
    assert.deepEqual(
      ranked.map((row) => row.percent),
      [115, -45, 12],
    );
    assert.equal(ranked.some((row) => row.percent == null), false);
    assert.equal(ranked.filter((row) => row.cardId === id(5)).length, 1);

    const many = Array.from({ length: 75 }, (_, n) => mover(n + 1, { percent: n + 1 }));
    const capped = rankMovers(many);
    assert.equal(capped.length, MOVERS_CAP);
    assert.equal(capped[0]?.percent, 75);
    assert.equal(capped.at(-1)?.percent, 16);
  });

  it("splits up and down, each biggest move first", () => {
    const { up, down } = splitMovers([
      mover(1, { percent: 12 }),
      mover(2, { percent: -45 }),
      mover(3, { percent: 80 }),
      mover(4, { percent: -5 }),
      mover(5, { percent: null }),
    ]);
    assert.deepEqual(up.map((row) => row.percent), [80, 12]);
    assert.deepEqual(down.map((row) => row.percent), [-45, -5]);
  });

  it("validates the tile fields and still rejects a bad payload", () => {
    assert.equal(isMovingTodaySale(mover(1)), true);
    // A mover always has a real percent. A card never does.
    assert.equal(isMovingTodaySale(mover(1, { percent: null, percentLabel: null })), false);
    assert.equal(isMovingTodaySale(mover(1, { kind: "card", percent: null, percentLabel: null })), true);
    assert.equal(isMovingTodaySale(mover(1, { kind: "card" })), false);
    assert.equal(
      isMovingTodaySale(
        mover(1, { kind: "card", percent: null, percentLabel: null, soldOn: undefined, soldLabel: undefined }),
      ),
      true,
    );
    assert.equal(isMovingTodaySale({ ...mover(1), kind: undefined }), false);
    const noYear: Partial<MovingTodaySale> = mover(1);
    delete noYear.yearLabel;
    assert.equal(isMovingTodaySale(noYear), false);
    assert.equal(isMovingTodaySale({ ...mover(1), setBrand: 7 }), false);
    assert.equal(isMovingTodaySale({ ...mover(1), grader: null }), false);
    assert.equal(isMovingTodaySale({ ...mover(1), conditionType: "slabbed" }), false);
    assert.equal(isMovingTodaySale({ ...mover(1), isRookie: "yes" }), false);
    assert.equal(isMovingTodaySale({ ...mover(1), percent: "40" }), false);
    assert.equal(isMovingTodaySale({ ...mover(1), percent: Number.NaN }), false);
    assert.equal(isMovingTodaySale({ ...mover(1), href: "https://evil.example" }), false);
    assert.equal(shouldShowMovingToday([mover(1), { cardId: "x" }]), false);
    assert.equal(shouldShowMovingToday("nope"), false);
  });
});

describe("cached movers across midnight", () => {
  const dayPayload = (count: number): MovingTodayPayload => ({
    title: "Moving today",
    date: TODAY,
    dateLabel: "Oct 22",
    window: "day",
    updatedAt: "2026-10-22T18:00:00.000Z",
    sales: Array.from({ length: count }, (_, n) => mover(n + 1, { percent: 10 + n })),
    moverCount: count,
    totalCount: count,
  });

  it("stays Moving today on the same New York date with six movers", () => {
    const fresh = freshenMovingToday(dayPayload(6), new Date("2026-10-23T03:30:00.000Z"));
    assert.equal(fresh.title, "Moving today");
    assert.equal(fresh.window, "day");
    assert.equal(fresh.dateLabel, "Oct 22");
    assert.equal(fresh.sales.length, 6);
    assert.equal(fresh.updatedAt, "2026-10-22T18:00:00.000Z");
    assert.deepEqual(
      fresh.sales.map((sale) => sale.percent),
      [15, 14, 13, 12, 11, 10],
    );
  });

  it("falls back to the week after midnight, then the month, never to empty", () => {
    const afterMidnight = freshenMovingToday(dayPayload(6), new Date("2026-10-23T04:30:00.000Z"));
    assert.equal(afterMidnight.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(afterMidnight.window, "week");
    assert.equal(afterMidnight.dateLabel, "Oct 17 – Oct 23");
    assert.equal(afterMidnight.sales.length, 6);
    assert.equal(afterMidnight.updatedAt, "2026-10-22T18:00:00.000Z");

    const eighthDay = freshenMovingToday(dayPayload(6), new Date("2026-10-30T16:00:00.000Z"));
    assert.equal(eighthDay.window, "month");
    assert.equal(eighthDay.title, "Moving this month");
    assert.equal(eighthDay.dateLabel, "Last 30 days");
    assert.equal(eighthDay.sales.length, 6);
    assert.equal(eighthDay.updatedAt, "2026-10-22T18:00:00.000Z");

    // Past 30 days the movers become plain cards: no percent, still shown.
    const later = freshenMovingToday(dayPayload(6), new Date("2026-11-30T16:00:00.000Z"));
    assert.equal(later.window, "fresh");
    assert.equal(later.title, "Fresh on Slabhold");
    assert.equal(later.sales.length, 6);
    assert.equal(later.moverCount, 0);
    assert.equal(later.sales.every((sale) => sale.kind === "card" && sale.percent === null), true);
    // Movers-only drops them instead.
    assert.equal(freshenMovingToday(dayPayload(6), new Date("2026-11-30T16:00:00.000Z"), "movers-only").sales.length, 0);
  });

  it("drops to the week below six movers and keeps even two", () => {
    const five = freshenMovingToday(dayPayload(5), new Date("2026-10-22T19:00:00.000Z"));
    assert.equal(five.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(five.window, "week");
    assert.equal(five.sales.length, 5);
    const two = freshenMovingToday(dayPayload(2), new Date("2026-10-22T19:00:00.000Z"));
    assert.equal(two.sales.length, 2);
    assert.equal(two.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(two.moverCount, 2);
  });

  it("never shows a cached row without a real percent", () => {
    const cached = dayPayload(6);
    cached.sales[0] = { ...cached.sales[0]!, percent: null, percentLabel: null };
    const fresh = freshenMovingToday(cached, new Date("2026-10-22T19:00:00.000Z"));
    assert.equal(fresh.window, "week");
    assert.equal(fresh.sales.length, 5);
    assert.equal(fresh.sales.some((sale) => sale.percent == null), false);
  });

  it("keeps a cached week labeled for the current New York date and drops old sales", () => {
    const sales = [0, 1, 2].map((offset) =>
      mover(50 + offset, { soldOn: addCalendarDays(TODAY, -offset), percent: 30 - offset }),
    );
    const cached: MovingTodayPayload = {
      title: "Moving today",
      date: TODAY,
      dateLabel: "Oct 22",
      window: "week",
      sales,
      moverCount: 3,
      totalCount: 3,
    };
    const sameEvening = freshenMovingToday(cached, new Date("2026-10-23T03:30:00.000Z"));
    assert.equal(sameEvening.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(sameEvening.dateLabel, "Oct 16 – Oct 22");
    assert.equal(sameEvening.sales.length, 3);
    const afterMidnight = freshenMovingToday(cached, new Date("2026-10-23T04:30:00.000Z"));
    assert.equal(afterMidnight.dateLabel, "Oct 17 – Oct 23");
    const lateWeek = freshenMovingToday(cached, new Date("2026-10-28T23:59:00-04:00"));
    // Only the Oct 22 sale is inside the week ending Oct 28, so the month holds more.
    assert.equal(lateWeek.window, "month");
    assert.equal(lateWeek.sales.length, 3);
  });
});

describe("public card assembly", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";

  const card = (cardId: string, userId: string, player: string): PublicCardRef => ({
    id: cardId,
    userId,
    player,
    yearLabel: "2023-24",
    setName: "Prizm",
    grade: "PSA 10",
    imageUrl: "https://project.supabase.co/storage/v1/object/public/card-photos/user/card.jpg",
    accent: "#7c5cff",
    grader: "PSA",
    conditionType: "graded",
    isRookie: true,
  });

  function raw(
    queryKey: string,
    cardId: string,
    price: number,
    itemId: string,
    soldAt = "2026-10-22T00:00:00+00:00",
  ): RawCompSale {
    return { queryKey, cardId, itemId, price, soldAt };
  }

  /** Three earlier comps, so the sale shows `percent` versus their mean. */
  function comps(sale: RawCompSale, percent: number): RawCompSale[] {
    const base = Math.round((sale.price / (1 + percent / 100)) * 100) / 100;
    return [10, 11, 12].map((days) =>
      raw(
        sale.queryKey,
        sale.cardId,
        base,
        `${sale.itemId}-prior-${days}`,
        `${addCalendarDays(sale.soldAt.slice(0, 10), -days)}T00:00:00+00:00`,
      ),
    );
  }

  function fillers(
    count: number,
    soldAt = "2026-10-22T00:00:00+00:00",
    price = 40,
    start = 1,
    percent = 100,
  ) {
    const sales: RawCompSale[] = [];
    const cards: PublicCardRef[] = [];
    const history: RawCompSale[] = [];
    for (let n = start; n < start + count; n += 1) {
      const cardId = id(n);
      const sale = raw(`fill-${n}-${soldAt.slice(0, 10)}`, cardId, price, `fill-${n}`, soldAt);
      sales.push(sale);
      history.push(...comps(sale, percent));
      cards.push(card(cardId, "user-1", `Player ${n}`));
    }
    return { sales, cards, history };
  }

  const ada = [{ id: "user-1", username: "Ada" }];

  it("links a public copy with tile fields and hides a sale with no public card", () => {
    const wemby = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
    const hidden = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const pad = fillers(5);
    const wembySale = raw("wemby", wemby, 200, "w");
    const hiddenSale = raw("hidden", hidden, 5000, "h");
    const payload = assembleMovingToday({
      today: TODAY,
      updatedAt: "2026-10-22T18:00:00.000Z",
      sales: [hiddenSale, wembySale, ...pad.sales],
      history: [...comps(wembySale, 60), ...comps(hiddenSale, 300), ...pad.history],
      cards: [card(wemby, "user-1", "Victor Wembanyama"), ...pad.cards],
      profiles: ada,
      alternates: [],
    });
    const row = payload.sales.find((sale) => sale.player === "Victor Wembanyama");
    assert.equal(payload.title, "Moving today");
    assert.equal(payload.window, "day");
    assert.equal(payload.updatedAt, "2026-10-22T18:00:00.000Z");
    assert.equal(payload.sales.length, 6);
    assert.equal(row?.detail, "2023-24 · Prizm · PSA 10");
    assert.equal(row?.yearLabel, "2023-24");
    assert.equal(row?.setBrand, "Prizm");
    assert.equal(row?.grade, "PSA 10");
    assert.equal(row?.grader, "PSA");
    assert.equal(row?.conditionType, "graded");
    assert.equal(row?.isRookie, true);
    assert.equal(row?.priceLabel, "$200.00");
    assert.equal(row?.soldLabel, "Oct 22");
    assert.equal(row?.percent, 60);
    assert.equal(row?.percentLabel, "+60%");
    assert.equal(row?.href, `/u/ada/cards/${wemby}`);
    assert.equal(row?.imageUrl?.includes("card.jpg"), true);
    assert.equal(payload.sales.some((sale) => sale.cardId === hidden), false);
    assert.equal(payload.sales.every(isMovingTodaySale), true);
  });

  it("puts cards without a real percent after the movers, as plain cards", () => {
    const pad = fillers(6);
    const noComps = raw("dart", id(99), 900, "dart");
    const down = raw("down", id(98), 30, "down");
    const big = raw("big", id(97), 50, "big");
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [noComps, down, big, ...pad.sales],
      history: [...comps(down, -40), ...comps(big, 115), ...pad.history],
      cards: [
        card(noComps.cardId, "user-1", "Jaxson Dart"),
        card(down.cardId, "user-1", "Down Card"),
        card(big.cardId, "user-1", "Big Card"),
        ...pad.cards,
      ],
      profiles: ada,
      alternates: [],
    });
    const movers = payload.sales.filter((sale) => sale.kind === "mover");
    const dart = payload.sales.find((sale) => sale.player === "Jaxson Dart");
    assert.equal(dart?.kind, "card");
    assert.equal(dart?.percent, null);
    assert.equal(dart?.percentLabel, null);
    assert.equal(dart?.priceLabel, "$900.00");
    assert.equal(payload.sales.at(-1)?.player, "Jaxson Dart");
    assert.equal(movers.some((sale) => sale.percent == null), false);
    assert.equal(payload.sales[0]?.player, "Big Card");
    assert.equal(payload.sales[0]?.percent, 115);
    assert.equal(movers.at(-1)?.player, "Down Card");
    assert.equal(movers.at(-1)?.percent, -40);
    assert.equal(payload.moverCount, 8);
    assert.equal(payload.totalCount, 9);
    const moves = movers.map((sale) => Math.abs(sale.percent ?? 0));
    assert.deepEqual(moves, [...moves].sort((a, b) => b - a));
  });

  it("returns every mover, not the old five-row cap, up to 60", () => {
    const many = fillers(70);
    const payload = assembleMovingToday({
      today: TODAY,
      sales: many.sales,
      history: many.history,
      cards: many.cards,
      profiles: ada,
      alternates: [],
    });
    assert.equal(payload.window, "day");
    assert.equal(payload.moverCount, MOVERS_CAP);
    // Movers past the cap still show, as plain cards after the movers.
    assert.equal(payload.totalCount, 70);
    assert.equal(payload.sales.slice(MOVERS_CAP).every((sale) => sale.kind === "card"), true);
    const twelve = fillers(12);
    const all = assembleMovingToday({
      today: TODAY,
      sales: twelve.sales,
      history: twelve.history,
      cards: twelve.cards,
      profiles: ada,
      alternates: [],
    });
    assert.equal(all.sales.length, 12);
  });

  it("says Moving today only at six movers from today's comps", () => {
    const six = fillers(6);
    const day = assembleMovingToday({
      today: TODAY,
      sales: six.sales,
      history: six.history,
      cards: six.cards,
      profiles: ada,
      alternates: [],
    });
    assert.equal(day.title, "Moving today");
    assert.equal(day.dateLabel, "Oct 22");

    // Six sales today, but one has too few comps for an honest percent.
    const five = fillers(5);
    const thin = raw("thin", id(40), 40, "thin");
    const week = assembleMovingToday({
      today: TODAY,
      sales: [...five.sales, thin],
      history: [...five.history, ...comps(thin, 50).slice(0, 2)],
      cards: [...five.cards, card(thin.cardId, "user-1", "Thin")],
      profiles: ada,
      alternates: [],
    });
    assert.equal(week.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(week.window, "week");
    assert.equal(week.dateLabel, "Oct 16 – Oct 22");
    assert.equal(week.moverCount, 5);
    assert.equal(week.sales.at(-1)?.player, "Thin");
    assert.equal(week.sales.at(-1)?.kind, "card");
  });

  it("uses the week when only yesterday moved, never a Moving yesterday heading", () => {
    const pad = fillers(6, "2026-10-21T00:00:00+00:00", 90);
    const payload = assembleMovingToday({
      today: TODAY,
      asOf: TODAY,
      sales: pad.sales,
      history: pad.history,
      cards: pad.cards,
      profiles: ada,
      alternates: [],
    });
    assert.equal(payload.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(payload.window, "week");
    assert.equal(payload.sales[0]?.soldLabel, "Oct 21");
  });

  it("widens a thin day to the week, and keeps a two-mover week with its cards", () => {
    const thinDay = fillers(2, "2026-10-22T00:00:00+00:00", 30);
    const earlier = fillers(3, "2026-10-18T00:00:00+00:00", 50, 3);
    const week = assembleMovingToday({
      today: TODAY,
      sales: [...thinDay.sales, ...earlier.sales],
      history: [...thinDay.history, ...earlier.history],
      cards: [...thinDay.cards, ...earlier.cards],
      profiles: ada,
      alternates: [],
    });
    assert.equal(week.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(week.sales.length, 5);
    assert.equal(new Set(week.sales.map((sale) => sale.soldOn)).size > 1, true);

    const onlyTwo = fillers(2, "2026-10-21T00:00:00+00:00", 40);
    const noPercent = fillers(4, "2026-10-21T00:00:00+00:00", 40, 10);
    const hidden = assembleMovingToday({
      today: TODAY,
      asOf: TODAY,
      updatedAt: "2026-10-22T18:00:00.000Z",
      sales: [...onlyTwo.sales, ...noPercent.sales],
      history: onlyTwo.history,
      cards: [...onlyTwo.cards, ...noPercent.cards],
      profiles: ada,
      alternates: [],
    });
    assert.equal(hidden.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(hidden.moverCount, 2);
    assert.equal(hidden.totalCount, 6);
    assert.deepEqual(
      hidden.sales.map((sale) => sale.kind),
      ["mover", "mover", "card", "card", "card", "card"],
    );
    assert.equal(hidden.sales.slice(2).every((sale) => sale.percent === null), true);
    assert.equal(hidden.updatedAt, "2026-10-22T18:00:00.000Z");
  });

  it("falls back to another public card with the same identity", () => {
    const owned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const pub = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const pad = fillers(5);
    const shared = raw("shared", owned, 80, "s");
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [shared, ...pad.sales],
      history: [...comps(shared, 25), ...pad.history],
      cards: [card(pub, "user-2", "Luka Doncic"), ...pad.cards],
      profiles: [{ id: "user-2", username: "collector_1" }, ...ada],
      alternates: [{ queryKey: "shared", cardId: pub }],
    });
    const row = payload.sales.find((sale) => sale.player === "Luka Doncic");
    assert.equal(row?.href, `/u/collector_1/cards/${pub}`);
  });

  it("reads the calendar date from a midnight-UTC timestamp", () => {
    const parsed = toSaleRecord({
      queryKey: "k",
      cardId: CARD,
      itemId: "i",
      price: 12.5,
      soldAt: "2026-10-22T00:00:00+00:00",
    });
    assert.equal(parsed?.soldOn, "2026-10-22");
    assert.equal(parsed?.priceCents, 1250);
    assert.equal(saleCalendarDate("2026-10-21"), "2026-10-21");
  });

  it("drops a sale the card owner flagged as not a match", () => {
    const wemby = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
    const kept = dropOwnerFlaggedSales(
      [
        { cardId: wemby, itemId: "keep" },
        { cardId: wemby, itemId: "drop" },
      ],
      [{ id: wemby, userId: "owner-1" }],
      [
        { cardId: wemby, userId: "owner-1", itemId: "drop" },
        { cardId: wemby, userId: "someone-else", itemId: "keep" },
      ],
    );
    assert.deepEqual(kept.map((sale) => sale.itemId), ["keep"]);

    const pad = fillers(5);
    const dropped = raw("wemby", wemby, 200, "drop");
    const keep = raw("judge", wemby, 80, "keep");
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [dropped, keep, ...pad.sales],
      history: [...comps(dropped, 50), ...comps(keep, 50), ...pad.history],
      cards: [card(wemby, "owner-1", "Victor Wembanyama"), ...pad.cards],
      profiles: [{ id: "owner-1", username: "Ada" }, ...ada],
      alternates: [],
      owners: [{ id: wemby, userId: "owner-1" }],
      flags: [{ cardId: wemby, userId: "owner-1", itemId: "drop" }],
    });
    assert.equal(payload.sales.some((sale) => sale.priceLabel === "$200.00"), false);
    assert.equal(payload.sales.some((sale) => sale.priceLabel === "$80.00"), true);
  });

  it("skips movers under $5 when enough others remain, and keeps them otherwise", () => {
    const lead = fillers(6, "2026-10-22T00:00:00+00:00", 20);
    const cheap = fillers(2, "2026-10-22T00:00:00+00:00", 1.99, 20);
    const day = assembleMovingToday({
      today: TODAY,
      sales: [...lead.sales, ...cheap.sales],
      history: [...lead.history, ...cheap.history],
      cards: [...lead.cards, ...cheap.cards],
      profiles: ada,
      alternates: [],
    });
    assert.equal(day.window, "day");
    assert.equal(day.moverCount, 6);
    assert.equal(
      day.sales.some((sale) => sale.kind === "mover" && (sale.priceCents ?? 0) < 500),
      false,
    );

    const threeLead = fillers(3, "2026-10-22T00:00:00+00:00", 20);
    const threeCheap = fillers(3, "2026-10-22T00:00:00+00:00", 1, 30);
    const kept = assembleMovingToday({
      today: TODAY,
      sales: [...threeLead.sales, ...threeCheap.sales],
      history: [...threeLead.history, ...threeCheap.history],
      cards: [...threeLead.cards, ...threeCheap.cards],
      profiles: ada,
      alternates: [],
    });
    assert.equal(kept.window, "day");
    assert.equal(kept.sales.length, 6);
    assert.equal(kept.sales.some((sale) => (sale.priceCents ?? 0) < 500), true);

    const shortLead = fillers(2, "2026-10-20T00:00:00+00:00", 12);
    const shortCheap = fillers(1, "2026-10-22T00:00:00+00:00", 2, 41);
    const shortWeek = assembleMovingToday({
      today: TODAY,
      sales: [...shortCheap.sales, ...shortLead.sales],
      history: [...shortCheap.history, ...shortLead.history],
      cards: [...shortCheap.cards, ...shortLead.cards],
      profiles: ada,
      alternates: [],
    });
    assert.equal(shortWeek.window, "week");
    assert.equal(shortWeek.sales.length, 3);
    assert.equal(shortWeek.sales.some((sale) => (sale.priceCents ?? 0) < 500), true);
  });

  it("shows one row when two query keys share a card, and keeps a two-card week", () => {
    const shared = id(70);
    const pad = fillers(5);
    const alpha = raw("alpha", id(71), 100, "alpha");
    const beta = raw("beta", id(72), 40, "beta");
    const day = assembleMovingToday({
      today: TODAY,
      sales: [alpha, beta, ...pad.sales],
      history: [...comps(alpha, 30), ...comps(beta, 30), ...pad.history],
      cards: [card(shared, "user-1", "Shared Star"), ...pad.cards],
      profiles: ada,
      alternates: [
        { queryKey: "alpha", cardId: shared },
        { queryKey: "beta", cardId: shared },
      ],
    });
    const sharedRows = day.sales.filter((sale) => sale.cardId === shared);
    assert.equal(day.window, "day");
    assert.equal(day.sales.length, 6);
    assert.equal(sharedRows.length, 1);
    assert.equal(sharedRows[0]?.priceLabel, "$100.00");

    const publicB = id(80);
    const weekKeys = [
      { key: "a1", cardId: shared, price: 100, soldAt: "2026-10-22T00:00:00+00:00" },
      { key: "a2", cardId: shared, price: 40, soldAt: "2026-10-20T00:00:00+00:00" },
      { key: "b1", cardId: publicB, price: 80, soldAt: "2026-10-21T00:00:00+00:00" },
      { key: "b2", cardId: publicB, price: 30, soldAt: "2026-10-19T00:00:00+00:00" },
    ];
    const weekSales = weekKeys.map((row, index) => raw(row.key, id(90 + index), row.price, row.key, row.soldAt));
    const hidden = assembleMovingToday({
      today: TODAY,
      sales: weekSales,
      history: weekSales.flatMap((sale) => comps(sale, 40)),
      cards: [card(shared, "user-1", "Shared Star"), card(publicB, "user-1", "Second Card")],
      profiles: ada,
      alternates: weekKeys.map((row) => ({ queryKey: row.key, cardId: row.cardId })),
    });
    assert.equal(hidden.sales.length, 2);
    assert.equal(hidden.title, MOVING_THIS_WEEK_TITLE);
  });
  describe("every public card while the app is small", () => {
    const ASOF = "2026-10-29";
    const day = (offset: number) => `${addCalendarDays(ASOF, offset)}T00:00:00+00:00`;
    const added = (offset: number) => `${addCalendarDays(ASOF, offset)}T15:00:00.000Z`;
    const pub = (n: number, player: string, createdAt: string, extra: Partial<PublicCardRef> = {}) => ({
      ...card(id(n), "user-1", player),
      createdAt,
      ...extra,
    });

    /** Live data for Oct 23–29: two movers, Dart with sales and no %, a private card, 17 quiet cards. */
    function liveShape() {
      const lebron = raw("lebron", id(1), 138, "lebron-1", day(-2));
      const mccarthy = raw("mccarthy", id(2), 215, "mcc-1", day(-1));
      const mccarthyMore = [80, 90, 70].map((price, n) => raw("mccarthy", id(2), price, `mcc-${n + 2}`, day(-3 - n)));
      const dart = [60, 55, 58, 62, 50, 57].map((price, n) => raw("dart", id(3), price, `dart-${n}`, day(-n)));
      const secret = raw("secret", id(9), 400, "secret-1", day(0));
      const others = Array.from({ length: 17 }, (_, n) =>
        pub(100 + n, `Quiet ${n + 1}`, added(-3 - n * 2), n === 0 ? { estimatedValue: 12.5 } : {}),
      );
      const cards = [
        pub(1, "LeBron James", added(-40)),
        pub(2, "J.J. McCarthy", added(-30)),
        pub(3, "Jaxson Dart", added(-1)),
      ];
      return {
        sales: [lebron, mccarthy, ...mccarthyMore, ...dart, secret, raw("secret", id(9), 390, "secret-2", day(-1))],
        history: [...comps(lebron, 38), ...comps(mccarthy, 115), ...comps(secret, 300)],
        cards,
        newest: [...cards, ...others],
      };
    }

    it("shows the live shape: real movers first, then every public card newest first", () => {
      const live = liveShape();
      const payload = assembleMovingToday({
        today: ASOF,
        sales: live.sales,
        history: live.history,
        cards: live.cards,
        newest: live.newest,
        profiles: ada,
        alternates: [],
      });
      assert.equal(payload.window, "week", "the month has no more movers than the week");
      assert.equal(payload.title, MOVING_THIS_WEEK_TITLE);
      assert.equal(payload.moverCount, 2);
      assert.equal(payload.totalCount, 20);
      assert.equal(payload.sales.length, 20);
      assert.deepEqual(
        payload.sales.slice(0, 4).map((sale) => sale.player),
        ["J.J. McCarthy", "LeBron James", "Jaxson Dart", "Quiet 1"],
      );
      assert.deepEqual(payload.sales.slice(0, 2).map((sale) => sale.percentLabel), ["+115%", "+38%"]);
      assert.equal(payload.sales.slice(2).every((sale) => sale.kind === "card"), true);
      // No fabricated percent anywhere.
      assert.equal(payload.sales.filter((sale) => sale.percent != null).length, 2);
      assert.equal(payload.sales.some((sale) => sale.kind === "card" && sale.percentLabel != null), false);
      // The private card never shows, though it has sales and a big move.
      assert.equal(payload.sales.some((sale) => sale.cardId === id(9)), false);
      assert.equal(JSON.stringify(payload).includes(id(9)), false);
      // Dart: newest, its latest comp as the price, and the New chip.
      const dart = payload.sales[2]!;
      assert.equal(dart.priceLabel, "$60.00");
      assert.equal(dart.isNew, true);
      // A card with no comp shows its estimated value, or no price line.
      assert.equal(payload.sales[3]?.priceLabel, "$12.50");
      assert.equal(payload.sales[4]?.priceLabel, "");
      assert.equal(payload.sales[4]?.priceCents, null);
      // Added 40 days ago: not new.
      assert.equal(payload.sales[1]?.isNew, false);
      // The rest stay newest first.
      const added = payload.sales.slice(2).map((sale) => sale.addedAt ?? "");
      assert.deepEqual(added, [...added].sort().reverse());
      assert.equal(payload.sales.every(isMovingTodaySale), true);
    });

    it("titles a thin week the month when the month holds more movers", () => {
      const live = liveShape();
      const older = raw("older", id(4), 90, "older-1", day(-20));
      const payload = assembleMovingToday({
        today: ASOF,
        sales: [...live.sales, older],
        history: [...live.history, ...comps(older, -25)],
        cards: [...live.cards, pub(4, "Older Mover", added(-60))],
        newest: live.newest,
        profiles: ada,
        alternates: [],
      });
      assert.equal(payload.window, "month");
      assert.equal(payload.title, "Moving this month");
      assert.equal(payload.dateLabel, "Last 30 days");
      assert.equal(payload.moverCount, 3);
      assert.equal(payload.totalCount, 21);
    });

    it("says Fresh on Slabhold with no movers, and is empty with no public cards", () => {
      const five = Array.from({ length: 5 }, (_, n) => pub(200 + n, `Fresh ${n + 1}`, added(-n)));
      const fresh = assembleMovingToday({
        today: ASOF,
        sales: [],
        history: [],
        cards: [],
        newest: five,
        profiles: ada,
        alternates: [],
      });
      assert.equal(fresh.title, "Fresh on Slabhold");
      assert.equal(fresh.window, "fresh");
      assert.equal(fresh.dateLabel, "");
      assert.equal(fresh.moverCount, 0);
      assert.equal(fresh.totalCount, 5);
      assert.deepEqual(fresh.sales.map((sale) => sale.kind), ["card", "card", "card", "card", "card"]);
      assert.equal(shouldShowMovingToday(fresh.sales), true);

      const none = assembleMovingToday({
        today: ASOF,
        sales: [],
        history: [],
        cards: [],
        newest: [],
        profiles: ada,
        alternates: [],
      });
      assert.equal(none.sales.length, 0);
      assert.equal(none.totalCount, 0);
      assert.equal(shouldShowMovingToday(none.sales), false);
    });

    it("drops a card whose owner has no public handle", () => {
      const payload = assembleMovingToday({
        today: ASOF,
        sales: [],
        history: [],
        cards: [],
        newest: [pub(300, "Linked", added(0)), { ...pub(301, "Orphan", added(0)), userId: "user-x" }],
        profiles: ada,
        alternates: [],
      });
      assert.deepEqual(payload.sales.map((sale) => sale.player), ["Linked"]);
    });

    it("says Moving today at six movers today, then the other cards", () => {
      const six = fillers(6, day(0));
      const extra = [pub(400, "Extra Card", added(-2))];
      const payload = assembleMovingToday({
        today: ASOF,
        sales: six.sales,
        history: six.history,
        cards: six.cards,
        newest: [...six.cards.map((c) => ({ ...c, createdAt: added(-50) })), ...extra],
        profiles: ada,
        alternates: [],
      });
      assert.equal(payload.title, "Moving today");
      assert.equal(payload.window, "day");
      assert.equal(payload.moverCount, 6);
      assert.equal(payload.totalCount, 7);
      assert.equal(payload.sales.slice(0, 6).every((sale) => sale.kind === "mover"), true);
      assert.equal(payload.sales[6]?.player, "Extra Card");
    });

    it("movers-only mode keeps real movers and hides with none", () => {
      const live = liveShape();
      const only = assembleMovingToday({
        today: ASOF,
        sales: live.sales,
        history: live.history,
        cards: live.cards,
        newest: live.newest,
        profiles: ada,
        alternates: [],
        mode: "movers-only",
      });
      assert.deepEqual(only.sales.map((sale) => sale.player), ["J.J. McCarthy", "LeBron James"]);
      assert.equal(only.totalCount, 2);
      const none = assembleMovingToday({
        today: ASOF,
        sales: [],
        history: [],
        cards: [],
        newest: live.newest,
        profiles: ada,
        alternates: [],
        mode: "movers-only",
      });
      assert.equal(none.sales.length, 0);
      assert.equal(none.totalCount, 0);
    });

    it("keeps card tiles after midnight and never empties a non-empty payload", () => {
      const live = liveShape();
      const payload = assembleMovingToday({
        today: ASOF,
        sales: live.sales,
        history: live.history,
        cards: live.cards,
        newest: live.newest,
        profiles: ada,
        alternates: [],
      });
      const asDay: MovingTodayPayload = { ...payload, window: "day", date: ASOF };
      const next = freshenMovingToday(asDay, new Date("2026-10-30T05:00:00.000Z"));
      assert.equal(next.window, "week");
      assert.equal(next.totalCount, 20);
      assert.equal(next.sales.filter((sale) => sale.kind === "card").length, 18);
      // Months later the movers join the cards, newest first, with no percent.
      const much = freshenMovingToday(payload, new Date("2027-01-15T17:00:00.000Z"));
      assert.equal(much.window, "fresh");
      assert.equal(much.totalCount, 20);
      assert.equal(much.sales.some((sale) => sale.percent != null), false);
      assert.equal(much.sales[0]?.player, "Jaxson Dart");
      assert.equal(much.sales.at(-1)?.player, "LeBron James");
    });
  });
});
