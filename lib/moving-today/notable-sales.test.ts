import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleMovingToday, type PublicCardRef, type RawCompSale } from "./present";
import {
  addCalendarDays,
  BIG_MOVE_PERCENT,
  calendarDateInTimeZone,
  comparisonPricesCents,
  dropOwnerFlaggedSales,
  HONEST_MIN_COMPARISON_SALES,
  MOVING_THIS_WEEK_TITLE,
  MOVING_TODAY_MIN_DAY_ROWS,
  MOVING_TODAY_MIN_LEAD_CENTS,
  MOVING_TODAY_MIN_WEEK_ROWS,
  MOVING_TODAY_WEEK_DAYS,
  freshenMovingToday,
  movingDayHeading,
  movingDayIsRecent,
  movingTodayDescription,
  weekDateLabel,
  newYorkDayWindow,
  percentVersusRecentAverage,
  rankNotableSales,
  saleCalendarDate,
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

  it("labels a single day honestly and keeps it inside the week", () => {
    assert.equal(MOVING_TODAY_WEEK_DAYS, 7);
    assert.equal(MOVING_TODAY_MIN_DAY_ROWS, 5);
    assert.equal(MOVING_TODAY_MIN_WEEK_ROWS, 3);
    assert.equal(MOVING_TODAY_MIN_LEAD_CENTS, 500);
    assert.equal(movingDayHeading(TODAY, TODAY), "Moving today");
    assert.equal(movingDayHeading(addCalendarDays(TODAY, -1), TODAY), "Moving yesterday");
    assert.equal(movingDayHeading(addCalendarDays(TODAY, -2), TODAY), "Moving Oct 20");
    assert.equal(weekDateLabel(TODAY), "Oct 16 – Oct 22");
    assert.equal(movingDayIsRecent(addCalendarDays(TODAY, -6), TODAY), true);
    assert.equal(movingDayIsRecent(addCalendarDays(TODAY, -7), TODAY), false);

    const older = addCalendarDays(TODAY, -2);
    const olderSales = Array.from({ length: 5 }, (_, n) => {
      const cardId = `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;
      return {
        queryKey: `oct20-${n}`,
        cardId,
        itemId: `oct20-${n}`,
        price: 40,
        soldAt: `${older}T00:00:00+00:00`,
      };
    });
    const olderDay = assembleMovingToday({
      today: TODAY,
      asOf: TODAY,
      sales: olderSales,
      history: [],
      cards: olderSales.map((sale, n) => ({
        id: sale.cardId,
        userId: "user-1",
        player: `Player ${n}`,
        yearLabel: "2023-24",
        setName: "Prizm",
        grade: "PSA 10",
        imageUrl: null,
        accent: "#7c5cff",
      })),
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(olderDay.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(olderDay.window, "week");
    assert.equal(olderDay.sales.length, 5);
    const cachedOlderDay = freshenMovingToday(
      {
        title: "Moving Oct 20",
        date: older,
        dateLabel: "Oct 20",
        window: "day",
        sales: [
          {
            cardId: olderSales[0]?.cardId ?? CARD,
            href: `/u/ada/cards/${olderSales[0]?.cardId ?? CARD}`,
            player: "Player 0",
            detail: "",
            imageUrl: null,
            accent: "#7c5cff",
            priceCents: 4000,
            priceLabel: "$40.00",
            soldOn: older,
            soldLabel: "Oct 20",
            percent: null,
            percentLabel: null,
          },
        ],
      },
      new Date("2026-10-22T16:00:00.000Z"),
    );
    assert.equal(cachedOlderDay.sales.length, 0);
    assert.equal(cachedOlderDay.title, "Moving today");
  });

  it("relabels a cached today list after midnight and hides one older than two days", () => {
    const cached = {
      title: "Moving today",
      date: TODAY,
      dateLabel: "Oct 22",
      sales: [
        {
          cardId: CARD,
          href: `/u/ada/cards/${CARD}`,
          player: "Victor Wembanyama",
          detail: "2023-24 · Prizm",
          imageUrl: null,
          accent: "#7c5cff",
          priceCents: 20000,
          priceLabel: "$200.00",
          soldOn: TODAY,
          soldLabel: "Oct 22",
          percent: null,
          percentLabel: null,
        },
      ],
    };
    const justAfterMidnight = freshenMovingToday(cached, new Date("2026-10-23T04:30:00.000Z"));
    assert.equal(justAfterMidnight.date, TODAY);
    assert.equal(justAfterMidnight.title, "Moving yesterday");
    assert.equal(justAfterMidnight.sales.length, 1);
    assert.notEqual(justAfterMidnight.title, cached.title);

    const olderThanYesterday = freshenMovingToday(cached, new Date("2026-10-25T16:00:00.000Z"));
    assert.equal(olderThanYesterday.sales.length, 0);
    assert.equal(olderThanYesterday.title, "Moving today");

    const eighthDay = freshenMovingToday(cached, new Date("2026-10-30T16:00:00.000Z"));
    assert.equal(eighthDay.sales.length, 0);
    assert.equal(eighthDay.title, "Moving today");
    assert.equal(
      movingTodayDescription("Moving yesterday"),
      "Yesterday's notable sales across the Slabhold catalog.",
    );
    assert.equal(
      movingTodayDescription(MOVING_THIS_WEEK_TITLE),
      "This week's notable sales across the Slabhold catalog.",
    );
    assert.equal(
      movingTodayDescription("Moving today"),
      "Today's notable sales across the Slabhold catalog.",
    );
    assert.equal(
      movingTodayDescription("Moving Oct 20"),
      "Notable sales from Oct 20 across the Slabhold catalog.",
    );
    assert.doesNotMatch(movingTodayDescription("Moving yesterday"), /Moving yesterday across/);
  });
});

describe("public card assembly", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";

  const card = (id: string, userId: string, player: string): PublicCardRef => ({
    id,
    userId,
    player,
    yearLabel: "2023-24",
    setName: "Prizm",
    grade: "PSA 10",
    imageUrl: "https://project.supabase.co/storage/v1/object/public/card-photos/user/card.jpg",
    accent: "#7c5cff",
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

  function id(n: number): string {
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  }

  function fillers(count: number, soldAt = "2026-10-22T00:00:00+00:00", price = 40, start = 1) {
    const sales: RawCompSale[] = [];
    const cards: PublicCardRef[] = [];
    for (let n = start; n < start + count; n += 1) {
      const cardId = id(n);
      sales.push(raw(`fill-${n}-${soldAt.slice(0, 10)}`, cardId, price, `fill-${n}`, soldAt));
      cards.push(card(cardId, "user-1", `Player ${n}`));
    }
    return { sales, cards };
  }

  it("links a public copy and hides a sale with no public card", () => {
    const wemby = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
    const hidden = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const pad = fillers(4);
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [raw("hidden", hidden, 5000, "h"), raw("wemby", wemby, 200, "w"), ...pad.sales],
      history: [],
      cards: [card(wemby, "user-1", "Victor Wembanyama"), ...pad.cards],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    const row = payload.sales.find((sale) => sale.player === "Victor Wembanyama");
    assert.equal(payload.title, "Moving today");
    assert.equal(payload.window, "day");
    assert.equal(row?.detail, "2023-24 · Prizm · PSA 10");
    assert.equal(row?.priceLabel, "$200.00");
    assert.equal(row?.soldLabel, "Oct 22");
    assert.equal(row?.percentLabel, null);
    assert.equal(row?.href, `/u/ada/cards/${wemby}`);
    assert.equal(row?.imageUrl?.includes("card.jpg"), true);
    assert.equal(payload.sales.some((sale) => sale.cardId === hidden), false);
  });

  it("falls back to another public card with the same identity", () => {
    const owned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const pub = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const pad = fillers(4);
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [raw("shared", owned, 80, "s"), ...pad.sales],
      history: [],
      cards: [card(pub, "user-2", "Luka Doncic"), ...pad.cards],
      profiles: [
        { id: "user-2", username: "collector_1" },
        { id: "user-1", username: "Ada" },
      ],
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

    const pad = fillers(4);
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [raw("wemby", wemby, 200, "drop"), raw("judge", wemby, 80, "keep"), ...pad.sales],
      history: [],
      cards: [card(wemby, "owner-1", "Victor Wembanyama"), ...pad.cards],
      profiles: [{ id: "owner-1", username: "Ada" }, { id: "user-1", username: "Ada" }],
      alternates: [],
      owners: [{ id: wemby, userId: "owner-1" }],
      flags: [{ cardId: wemby, userId: "owner-1", itemId: "drop" }],
    });
    assert.equal(payload.sales.some((sale) => sale.priceLabel === "$200.00"), false);
    assert.equal(payload.sales.some((sale) => sale.priceLabel === "$80.00"), true);
  });

  it("calls yesterday by its name when today has no sales yet", () => {
    const pad = fillers(5, "2026-10-21T00:00:00+00:00", 90);
    const payload = assembleMovingToday({
      today: "2026-10-21",
      asOf: TODAY,
      sales: pad.sales,
      history: [],
      cards: pad.cards,
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(payload.title, "Moving yesterday");
    assert.equal(payload.dateLabel, "Oct 21");
    assert.equal(payload.window, "day");
    assert.equal(payload.sales[0]?.soldLabel, "Oct 21");
  });

  it("keeps a full day, widens a thin day to the week, and hides a thin week", () => {
    const fullToday = fillers(5, "2026-10-22T00:00:00+00:00", 25);
    const today = assembleMovingToday({
      today: TODAY,
      sales: fullToday.sales,
      history: [],
      cards: fullToday.cards,
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(today.title, "Moving today");
    assert.equal(today.dateLabel, "Oct 22");
    assert.equal(today.sales.length, 5);

    const thinDay = fillers(2, "2026-10-22T00:00:00+00:00", 30);
    const earlier = fillers(3, "2026-10-18T00:00:00+00:00", 50, 3);
    const week = assembleMovingToday({
      today: TODAY,
      sales: [...thinDay.sales, ...earlier.sales],
      history: [],
      cards: [...thinDay.cards, ...earlier.cards],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(week.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(week.dateLabel, "Oct 16 – Oct 22");
    assert.equal(week.window, "week");
    assert.equal(week.sales.length, 5);
    assert.equal(new Set(week.sales.map((sale) => sale.soldOn)).size > 1, true);

    const onlyTwo = fillers(2, "2026-10-21T00:00:00+00:00", 40);
    const hidden = assembleMovingToday({
      today: TODAY,
      asOf: TODAY,
      sales: onlyTwo.sales,
      history: [],
      cards: onlyTwo.cards,
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(hidden.sales.length, 0);
    assert.equal(hidden.title, "Moving today");
  });

  it("skips sales under $5 when enough other rows remain, and keeps them otherwise", () => {
    const lead = fillers(5, "2026-10-22T00:00:00+00:00", 20);
    const cheap = fillers(2, "2026-10-22T00:00:00+00:00", 1.99).sales.map((sale, index) => ({
      ...sale,
      queryKey: `cheap-${index}`,
      cardId: id(20 + index),
      itemId: `cheap-${index}`,
    }));
    const cheapCards = cheap.map((sale, index) => card(sale.cardId, "user-1", `Cheap ${index}`));
    const day = assembleMovingToday({
      today: TODAY,
      sales: [...lead.sales, ...cheap],
      history: [],
      cards: [...lead.cards, ...cheapCards],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(day.window, "day");
    assert.equal(day.sales.length, 5);
    assert.equal(day.sales.some((sale) => sale.priceCents < 500), false);

    const twoLead = fillers(2, "2026-10-22T00:00:00+00:00", 20);
    const threeCheap = [1, 2, 3].map((n) => {
      const cardId = id(30 + n);
      return {
        sale: raw(`small-${n}`, cardId, 1, `small-${n}`),
        card: card(cardId, "user-1", `Small ${n}`),
      };
    });
    const kept = assembleMovingToday({
      today: TODAY,
      sales: [...twoLead.sales, ...threeCheap.map((row) => row.sale)],
      history: [],
      cards: [...twoLead.cards, ...threeCheap.map((row) => row.card)],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(kept.window, "day");
    assert.equal(kept.sales.length, 5);
    assert.equal(kept.sales.some((sale) => sale.priceCents < 500), true);

    const oneCheapToday = raw("penny", id(40), 1.5, "penny");
    const weekLead = fillers(3, "2026-10-19T00:00:00+00:00", 25);
    const week = assembleMovingToday({
      today: TODAY,
      sales: [oneCheapToday, ...weekLead.sales],
      history: [],
      cards: [card(oneCheapToday.cardId, "user-1", "Penny"), ...weekLead.cards],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(week.window, "week");
    assert.equal(week.sales.length, 3);
    assert.equal(week.sales.some((sale) => sale.priceCents < 500), false);

    const shortLead = fillers(2, "2026-10-20T00:00:00+00:00", 12);
    const shortCheap = raw("penny-2", id(41), 2, "penny-2", "2026-10-22T00:00:00+00:00");
    const shortWeek = assembleMovingToday({
      today: TODAY,
      sales: [shortCheap, ...shortLead.sales],
      history: [],
      cards: [card(shortCheap.cardId, "user-1", "Penny"), ...shortLead.cards],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(shortWeek.window, "week");
    assert.equal(shortWeek.sales.length, 3);
    assert.equal(shortWeek.sales.some((sale) => sale.priceCents < 500), true);
  });

  it("keeps a cached week labeled for the current New York date", () => {
    const sales = [0, 1, 2].map((offset) => ({
      cardId: id(50 + offset),
      href: `/u/ada/cards/${id(50 + offset)}`,
      player: `Player ${offset}`,
      detail: "",
      imageUrl: null,
      accent: "#7c5cff",
      priceCents: 2000,
      priceLabel: "$20.00",
      soldOn: addCalendarDays(TODAY, -offset),
      soldLabel: "Oct",
      percent: null,
      percentLabel: null,
    }));
    const cached = {
      title: "Moving today",
      date: TODAY,
      dateLabel: "Oct 22",
      window: "week" as const,
      sales,
    };
    const sameEvening = freshenMovingToday(cached, new Date("2026-10-23T03:30:00.000Z"));
    assert.equal(sameEvening.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(sameEvening.dateLabel, "Oct 16 – Oct 22");
    const afterMidnight = freshenMovingToday(cached, new Date("2026-10-23T04:30:00.000Z"));
    assert.equal(afterMidnight.title, MOVING_THIS_WEEK_TITLE);
    assert.equal(afterMidnight.dateLabel, "Oct 17 – Oct 23");
    const tooOld = freshenMovingToday(
      {
        ...cached,
        sales: sales.map((sale) => ({ ...sale, soldOn: "2026-10-10" })),
      },
      new Date("2026-10-22T19:00:00.000Z"),
    );
    assert.equal(tooOld.sales.length, 0);
  });

  it("shows one row when two query keys share a card, and hides a two-card week", () => {
    const shared = id(70);
    const otherSale = id(71);
    const secondSale = id(72);
    const pad = fillers(4);
    const day = assembleMovingToday({
      today: TODAY,
      sales: [
        raw("alpha", otherSale, 100, "alpha"),
        raw("beta", secondSale, 40, "beta"),
        ...pad.sales,
      ],
      history: [],
      cards: [card(shared, "user-1", "Shared Star"), ...pad.cards],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [
        { queryKey: "alpha", cardId: shared },
        { queryKey: "beta", cardId: shared },
      ],
    });
    const sharedRows = day.sales.filter((sale) => sale.cardId === shared);
    assert.equal(day.window, "day");
    assert.equal(day.sales.length, 5);
    assert.equal(sharedRows.length, 1);
    assert.equal(sharedRows[0]?.priceLabel, "$100.00");

    const publicB = id(80);
    const weekKeys = [
      { key: "a1", cardId: shared, price: 100, soldAt: "2026-10-22T00:00:00+00:00" },
      { key: "a2", cardId: shared, price: 40, soldAt: "2026-10-20T00:00:00+00:00" },
      { key: "b1", cardId: publicB, price: 80, soldAt: "2026-10-21T00:00:00+00:00" },
      { key: "b2", cardId: publicB, price: 30, soldAt: "2026-10-19T00:00:00+00:00" },
    ];
    const hidden = assembleMovingToday({
      today: TODAY,
      sales: weekKeys.map((row, index) => raw(row.key, id(90 + index), row.price, row.key, row.soldAt)),
      history: [],
      cards: [card(shared, "user-1", "Shared Star"), card(publicB, "user-1", "Second Card")],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: weekKeys.map((row) => ({ queryKey: row.key, cardId: row.cardId })),
    });
    assert.equal(hidden.sales.length, 0);
    assert.equal(hidden.title, "Moving today");
  });

  it("drops week sales that fall outside the recomputed window", () => {
    const now = new Date("2026-10-28T23:59:00-04:00");
    assert.equal(calendarDateInTimeZone(now), "2026-10-28");
    const dates = ["2026-10-16", "2026-10-18", "2026-10-22"];
    const fresh = freshenMovingToday(
      {
        title: MOVING_THIS_WEEK_TITLE,
        date: TODAY,
        dateLabel: "Oct 16 – Oct 22",
        window: "week",
        sales: dates.map((soldOn, index) => ({
          cardId: id(60 + index),
          href: `/u/ada/cards/${id(60 + index)}`,
          player: `Player ${index}`,
          detail: "",
          imageUrl: null,
          accent: "#7c5cff",
          priceCents: 2500,
          priceLabel: "$25.00",
          soldOn,
          soldLabel: soldOn,
          percent: null,
          percentLabel: null,
        })),
      },
      now,
    );
    assert.equal(fresh.sales.length, 0);
    assert.equal(fresh.title, "Moving today");
  });
});
