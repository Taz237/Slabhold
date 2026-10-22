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
  movingDayHeading,
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

  it("labels a fallback day honestly", () => {
    assert.equal(movingDayHeading(TODAY, TODAY), "Moving today");
    assert.equal(movingDayHeading(addCalendarDays(TODAY, -1), TODAY), "Moving yesterday");
    assert.equal(movingDayHeading(addCalendarDays(TODAY, -2), TODAY), "Moving Oct 20");
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

  function raw(queryKey: string, cardId: string, price: number, itemId: string): RawCompSale {
    return {
      queryKey,
      cardId,
      itemId,
      price,
      soldAt: "2026-10-22T00:00:00+00:00",
    };
  }

  it("links a public copy and hides a sale with no public card", () => {
    const wemby = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
    const hidden = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [raw("hidden", hidden, 5000, "h"), raw("wemby", wemby, 200, "w")],
      history: [],
      cards: [card(wemby, "user-1", "Victor Wembanyama")],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(payload.title, "Moving today");
    assert.equal(payload.sales.length, 1);
    assert.equal(payload.sales[0]?.player, "Victor Wembanyama");
    assert.equal(payload.sales[0]?.detail, "2023-24 · Prizm · PSA 10");
    assert.equal(payload.sales[0]?.priceLabel, "$200.00");
    assert.equal(payload.sales[0]?.soldLabel, "Oct 22");
    assert.equal(payload.sales[0]?.percentLabel, null);
    assert.equal(payload.sales[0]?.href, `/u/ada/cards/${wemby}`);
    assert.equal(payload.sales[0]?.imageUrl?.includes("card.jpg"), true);
  });

  it("falls back to another public card with the same identity", () => {
    const owned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const pub = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const payload = assembleMovingToday({
      today: TODAY,
      sales: [raw("shared", owned, 80, "s")],
      history: [],
      cards: [card(pub, "user-2", "Luka Doncic")],
      profiles: [{ id: "user-2", username: "collector_1" }],
      alternates: [{ queryKey: "shared", cardId: pub }],
    });
    assert.equal(payload.sales[0]?.href, `/u/collector_1/cards/${pub}`);
    assert.equal(payload.sales[0]?.player, "Luka Doncic");
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

    const payload = assembleMovingToday({
      today: TODAY,
      sales: [
        raw("wemby", wemby, 200, "drop"),
        raw("judge", wemby, 80, "keep"),
      ],
      history: [],
      cards: [card(wemby, "owner-1", "Victor Wembanyama")],
      profiles: [{ id: "owner-1", username: "Ada" }],
      alternates: [],
      owners: [{ id: wemby, userId: "owner-1" }],
      flags: [{ cardId: wemby, userId: "owner-1", itemId: "drop" }],
    });
    assert.equal(payload.sales.length, 1);
    assert.equal(payload.sales[0]?.priceLabel, "$80.00");
  });

  it("calls yesterday by its name when today has no sales yet", () => {
    const wemby = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
    const payload = assembleMovingToday({
      today: "2026-10-21",
      asOf: TODAY,
      sales: [
        {
          queryKey: "wemby",
          cardId: wemby,
          itemId: "y",
          price: 90,
          soldAt: "2026-10-21T00:00:00+00:00",
        },
      ],
      history: [],
      cards: [card(wemby, "user-1", "Victor Wembanyama")],
      profiles: [{ id: "user-1", username: "Ada" }],
      alternates: [],
    });
    assert.equal(payload.title, "Moving yesterday");
    assert.equal(payload.dateLabel, "Oct 21");
    assert.equal(payload.sales[0]?.soldLabel, "Oct 21");
  });
});
