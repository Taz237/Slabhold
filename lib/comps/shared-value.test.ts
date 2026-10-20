import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { money } from "@/lib/format";
import { formatCardValueLabel, NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import { attachmentValueLabel } from "@/lib/social/post-card-value";
import { previewValueLabelFromSources } from "@/lib/comps/preview-value";
import type { CompListing } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import {
  preserveValueOnFailedAttempt,
  refreshCardValueResult,
  valueAfterRefreshError,
} from "@/lib/value/refresh-result";
import { middleFifty } from "./stats";
import {
  amountFromStoredCompValue,
  countForSalesLabel,
  displayedCompLabel,
  pricePayloadWithoutFlags,
  resolveCardScreenValue,
  screenValueFromComps,
  sharedCompValue,
  valueFromShownSales,
} from "./shared-value";
import type { MatchCard } from "./match";
import type { TrawlSoldResult } from "./types";

function rawResult(
  title: string,
  opts: {
    item_id?: string;
    sale_price?: number;
    date?: string;
    grading?: {
      graded: boolean;
      grader: string | null;
      grade: string | null;
      condition: string | null;
    };
  } = {},
): TrawlSoldResult {
  const price = opts.sale_price ?? 20;
  const date = opts.date ?? "2026-09-01T00:00:00.000Z";
  return {
    title,
    sale_price: price,
    shipping_price: 0,
    currency: "$",
    condition: "used",
    condition_raw: "Pre-Owned",
    date_sold: date,
    buying_format: "Buy It Now",
    item_id: opts.item_id ?? "r1",
    item_link: "https://www.ebay.com/itm/r1",
    image_url: null,
    details: {
      listing_state: "sold",
      grading: opts.grading ?? {
        graded: false,
        grader: null,
        grade: null,
        condition: null,
      },
      sales: [{ date_sold: date, sale_price: price, shipping_price: 0, currency: "$" }],
    },
  };
}

function gradedResult(
  title: string,
  grader: string,
  grade: string,
  item_id: string,
  sale_price = 100,
  date = "2026-09-01T00:00:00.000Z",
): TrawlSoldResult {
  return rawResult(title, {
    item_id,
    sale_price,
    date,
    grading: { graded: true, grader, grade, condition: null },
  });
}

const PSA10: MatchCard = {
  playerName: "Victor Wembanyama",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  conditionType: "graded",
  grade: "PSA 10",
};

const RAW: MatchCard = {
  ...PSA10,
  conditionType: "raw",
  grade: "Raw",
};

const SILVER: MatchCard = {
  ...PSA10,
  parallel: "Silver",
};

describe("sharedCompValue parallel and grade", () => {
  const basePsa10 = "2023-24 Panini Prizm Victor Wembanyama #136 PSA 10";
  const silverPsa10 = "2023-24 Panini Prizm Silver Victor Wembanyama #136 PSA 10";
  const goldPsa10 = "2023-24 Panini Prizm Gold Victor Wembanyama #136 PSA 10";
  const basePsa9 = "2023-24 Panini Prizm Victor Wembanyama #136 PSA 9";
  const baseRaw = "2023-24 Panini Prizm Victor Wembanyama #136";
  const silverRaw = "2023-24 Panini Prizm Silver Victor Wembanyama #136";
  const otherPlayer = "2023-24 Panini Prizm Silver LeBron James #136 PSA 10";
  const otherSet = "2023-24 Panini Select Victor Wembanyama #136 PSA 10";

  const mixed = [
    gradedResult(basePsa10, "PSA", "10", "base10", 100, "2026-09-01T00:00:00.000Z"),
    gradedResult(basePsa10, "PSA", "10", "base10b", 110, "2026-09-03T00:00:00.000Z"),
    gradedResult(basePsa9, "PSA", "9", "psa9", 40),
    gradedResult(silverPsa10, "PSA", "10", "silver", 250, "2026-09-02T00:00:00.000Z"),
    gradedResult(goldPsa10, "PSA", "10", "gold", 800),
    rawResult(baseRaw, { item_id: "raw", sale_price: 18 }),
    rawResult(silverRaw, { item_id: "silver-raw", sale_price: 30 }),
    gradedResult(otherPlayer, "PSA", "10", "lebron", 90),
    gradedResult(otherSet, "PSA", "10", "select", 70),
  ];

  it("PSA 10 base uses only PSA 10 base sales", () => {
    const valued = sharedCompValue(PSA10, mixed);
    assert.deepEqual(
      valued.sales.map((sale) => sale.itemId).sort(),
      ["base10", "base10b"],
    );
    assert.equal(valued.count, 2);
    assert.equal(valued.median, 105);
    assert.equal(valued.basis.length, valued.sales.length);
    assert.ok(valued.basis.every((sale) => sale.grade === "PSA 10"));
    assert.deepEqual(
      valued.basis.map((sale) => sale.price).sort((a, b) => a - b),
      [100, 110],
    );
  });

  it("raw base uses only raw base sales", () => {
    const valued = sharedCompValue(RAW, mixed);
    assert.deepEqual(
      valued.sales.map((sale) => sale.itemId),
      ["raw"],
    );
    assert.equal(valued.median, 18);
    assert.deepEqual(valued.basis, [
      { date: "2026-09-01", price: 18, grade: "Raw" },
    ]);
  });

  it("silver PSA 10 uses only silver PSA 10 sales", () => {
    const valued = sharedCompValue(SILVER, mixed);
    assert.deepEqual(
      valued.sales.map((sale) => sale.itemId),
      ["silver"],
    );
    assert.equal(valued.count, valued.basis.length);
    assert.equal(valued.basis[0]?.grade, "PSA 10");
    assert.equal(valued.basis[0]?.date, "2026-09-02");
    assert.equal(valued.basis[0]?.price, 250);
    assert.equal(valued.median, 250);
  });

  it("returns no number when nothing matches", () => {
    const valued = sharedCompValue(
      { ...PSA10, playerName: "Nobody Real" },
      mixed,
    );
    assert.equal(valued.count, 0);
    assert.equal(valued.median, null);
    assert.deepEqual(valued.basis, []);
  });
});

describe("resolveCardScreenValue", () => {
  const listing = (partial: Partial<CompListing> & Pick<CompListing, "itemId" | "soldPrice">): CompListing => ({
    id: partial.itemId,
    title: partial.title ?? "2023 Prizm",
    soldDate: partial.soldDate ?? "2026-09-01",
    platform: "eBay",
    condition: partial.condition ?? "PSA 10",
    shipping: null,
    url: "",
    ...partial,
  });

  const storedNoSales: CardValueResult = {
    status: "no_sales",
    median: null,
    low: null,
    high: null,
    nSales: 0,
    matchedAt: "2026-09-01T00:00:00.000Z",
  };

  it("prices the rows on screen, not a stale stored row", () => {
    const resolved = resolveCardScreenValue({
      phase: "ready",
      comps: [
        listing({ itemId: "a", soldPrice: 100, soldDate: "2026-09-01", condition: "PSA 10" }),
        listing({ itemId: "b", soldPrice: 120, soldDate: "2026-09-02", condition: "PSA 10" }),
      ],
      stored: storedNoSales,
    });
    assert.equal(resolved.phase, "comps");
    assert.equal(resolved.amount, 110);
    assert.equal(resolved.count, 2);
    assert.equal(resolved.count, resolved.comps?.length);
    assert.equal(resolved.emptyLabel, null);
  });

  it("drops a flagged sale from the price and the count together", () => {
    const comps = [
      listing({ itemId: "keep", soldPrice: 80, condition: "PSA 10" }),
      listing({ itemId: "drop", soldPrice: 400, condition: "PSA 10" }),
    ];
    const payload = {
      comps,
      history: [],
      median: 240,
      p25: 80,
      p75: 400,
      count: 2,
      source: "trawl" as const,
      cached: true,
      fetchedAt: "2026-10-19T00:00:00.000Z",
      query: "test",
      lowConfidence: true,
      sample: false,
    };
    const priced = pricePayloadWithoutFlags(payload, new Set(["drop"]));
    assert.equal(priced.count, 1);
    assert.equal(priced.comps.length, priced.count);
    assert.equal(priced.median, 80);
    assert.notEqual(priced.median, payload.median);
    assert.equal(countForSalesLabel(priced.count, priced.comps.length), priced.count);
    assert.deepEqual(
      priced.comps.map((comp) => comp.itemId),
      ["keep"],
    );
  });

  it("excluding a flagged sale changes the median and N together", () => {
    const resolved = resolveCardScreenValue({
      phase: "ready",
      comps: [
        listing({ itemId: "keep", soldPrice: 80, condition: "PSA 10" }),
        listing({ itemId: "drop", soldPrice: 400, condition: "PSA 9" }),
      ],
      hiddenItemIds: new Set(["drop"]),
      stored: {
        status: "ok",
        median: 240,
        low: 80,
        high: 400,
        nSales: 2,
        matchedAt: null,
      },
    });
    assert.equal(resolved.amount, 80);
    assert.equal(resolved.count, 1);
    assert.equal(resolved.count, resolved.comps?.length);
    assert.notEqual(resolved.amount, 240);
    assert.deepEqual(
      resolved.comps?.map((comp) => comp.itemId),
      ["keep"],
    );
  });

  it("drops a different grade from the list without recomputing the price", () => {
    const resolved = resolveCardScreenValue({
      phase: "ready",
      card: PSA10,
      comps: [
        listing({
          itemId: "ok",
          title: "2023-24 Panini Prizm Victor Wembanyama #136 PSA 10",
          soldPrice: 100,
          condition: "PSA 10",
        }),
        listing({
          itemId: "no",
          title: "2023-24 Panini Prizm Victor Wembanyama #136 PSA 9",
          soldPrice: 40,
          condition: "PSA 9",
        }),
      ],
      stored: {
        status: "ok",
        median: 100,
        low: 100,
        high: 100,
        nSales: 1,
        matchedAt: null,
      },
    });
    assert.equal(resolved.comps?.length, 1);
    assert.equal(resolved.amount, 100);
    assert.equal(resolved.count, 1);
    assert.equal(resolved.emptyLabel, null);
  });

  it("does not keep a stored count when no rows are shown", () => {
    const resolved = resolveCardScreenValue({
      phase: "ready",
      comps: [],
      stored: {
        status: "ok",
        median: 500,
        low: 500,
        high: 500,
        nSales: 4,
        matchedAt: null,
      },
    });
    assert.equal(resolved.amount, null);
    assert.equal(resolved.emptyLabel, NOT_ENOUGH_SALES_LABEL);
    assert.equal(resolved.count, 0);
  });
});

const DART_BASE: MatchCard = {
  playerName: "Jaxson Dart",
  year: 2025,
  yearLabel: "2025",
  setBrand: "Panini Prizm",
  cardNumber: "332",
  parallel: "Base",
  conditionType: "raw",
  grade: "Raw",
};

const DART_PREFIX = "2025 Panini Prizm Jaxson Dart";

function dartSale(title: string, price: number, itemId: string): TrawlSoldResult {
  return rawResult(`${DART_PREFIX} ${title}`, { item_id: itemId, sale_price: price });
}

const DART_SALES: TrawlSoldResult[] = [
  dartSale("#332 Rookie RC Giants", 3, "base-giants"),
  rawResult("2025 Panini Prizm #332 Jaxson Dart RC Base", {
    item_id: "base-named",
    sale_price: 2.5,
  }),
  dartSale("#332 Lazer Prizm", 15, "lazer-prizm"),
  dartSale("#332 Lazer Rookie", 13, "lazer"),
  dartSale("#332 RC Hyper Prizm", 12, "hyper"),
  dartSale("#332 RC Pulsar", 17, "pulsar"),
  dartSale("#332 RC Neon Green", 19, "neon"),
  dartSale("#332 RC Silver Prizm", 9, "silver"),
  dartSale("#332 RC Snakeskin", 14, "snakeskin"),
];

describe("Jaxson Dart Prizm parallels stay off Base", () => {
  it("keeps only the two base sales and a median of about 3", () => {
    const valued = sharedCompValue(DART_BASE, DART_SALES);
    assert.deepEqual(
      valued.sales.map((sale) => sale.price).sort((a, b) => a - b),
      [2.5, 3],
    );
    assert.equal(valued.count, 2);
    assert.equal(valued.median, 2.75);

    const blankParallel = sharedCompValue({ ...DART_BASE, parallel: "" }, DART_SALES);
    assert.equal(blankParallel.median, 2.75);
    assert.equal(blankParallel.count, 2);
  });

  it("keeps only the Silver sale when the card is Silver", () => {
    const valued = sharedCompValue({ ...DART_BASE, parallel: "Silver" }, DART_SALES);
    assert.deepEqual(
      valued.sales.map((sale) => sale.price),
      [9],
    );
    assert.equal(valued.count, 1);
    assert.equal(valued.median, 9);
  });

  it("shows the stored median for the same base sales the helper priced", () => {
    const stored = {
      status: "ok" as const,
      median: 2.75,
      low: 2.63,
      high: 2.88,
      nSales: 2,
      matchedAt: "2026-10-18T00:00:00.000Z",
    };
    const resolved = resolveCardScreenValue({
      phase: "ready",
      card: DART_BASE,
      stored,
      comps: DART_SALES.map((sale) => ({
        id: sale.item_id,
        itemId: sale.item_id,
        title: sale.title,
        soldPrice: sale.sale_price,
        soldDate: sale.date_sold.slice(0, 10),
        platform: "eBay" as const,
        condition: "Raw",
        shipping: null,
        url: sale.item_link,
      })),
    });
    assert.equal(resolved.amount, 2.75);
    assert.equal(resolved.count, 2);
    assert.equal(resolved.count, resolved.comps?.length);
    assert.equal(resolved.comps?.length, 2);
    assert.equal(displayedCompLabel(DART_BASE, DART_SALES), money(stored.median, true));
  });
});

describe("Jordan Love PSA 10", () => {
  const love: MatchCard = {
    playerName: "Jordan Love",
    year: 2020,
    yearLabel: "2020",
    setBrand: "Panini Select",
    cardNumber: "47",
    parallel: "Base",
    conditionType: "graded",
    grade: "PSA 10",
  };

  const sales: TrawlSoldResult[] = [
    ...Array.from({ length: 9 }, (_, index) =>
      gradedResult(
        "2020 Panini Select Jordan Love #47 PSA 10",
        "PSA",
        "10",
        `love-${index}`,
        35,
        `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    ),
    gradedResult(
      "2020 Panini Select Jordan Love #47 PSA 9",
      "PSA",
      "9",
      "love-psa9",
      18,
      "2026-08-10T00:00:00.000Z",
    ),
    gradedResult(
      "2020 Panini Select Silver Jordan Love #47 PSA 10",
      "PSA",
      "10",
      "love-silver",
      90,
      "2026-08-11T00:00:00.000Z",
    ),
  ];

  it("keeps 9 PSA 10 base sales at $35 and drops PSA 9 and Silver", () => {
    const valued = sharedCompValue(love, sales);
    assert.equal(valued.count, 9);
    assert.equal(valued.median, 35);
    assert.equal(valued.sales.length, 9);
    assert.ok(valued.basis.every((sale) => sale.grade === "PSA 10" && sale.price === 35));
    assert.equal(displayedCompLabel(love, sales), money(35, true));
  });
});

function rawBase(card: MatchCard, title: string, price = 8): TrawlSoldResult {
  return rawResult(title, { item_id: title, sale_price: price });
}

describe("base cards ignore set and player words", () => {
  const dart: MatchCard = { ...DART_BASE, parallel: "Base" };
  const keeps = [
    {
      card: dart,
      title: "2025 Jaxson Dart #332 Panini Prizm Rookie RC",
    },
    {
      card: {
        playerName: "Victor Wembanyama",
        year: 2023,
        yearLabel: "2023-24",
        setBrand: "Panini Prizm",
        cardNumber: "136",
        parallel: "Base",
        conditionType: "raw" as const,
        grade: "Raw",
      },
      title: "Victor Wembanyama 2023-24 #136 Panini Prizm Rookie",
    },
    {
      card: {
        playerName: "Paul Skenes",
        year: 2024,
        yearLabel: "2024",
        setBrand: "SP Authentic",
        cardNumber: "10",
        parallel: "Base",
        conditionType: "raw" as const,
        grade: "Raw",
      },
      title: "2024 Upper Deck SP Authentic Paul Skenes #10 RC",
    },
    {
      card: {
        playerName: "Connor Bedard",
        year: 2023,
        yearLabel: "2023-24",
        setBrand: "Upper Deck Ice",
        cardNumber: "101",
        parallel: "Base",
        conditionType: "raw" as const,
        grade: "Raw",
      },
      title: "2023-24 Upper Deck Ice Connor Bedard #101 RC",
    },
    {
      card: {
        playerName: "Tiger Woods",
        year: 2001,
        yearLabel: "2001",
        setBrand: "Upper Deck",
        cardNumber: "1",
        parallel: "Base",
        conditionType: "raw" as const,
        grade: "Raw",
      },
      title: "2001 Upper Deck Tiger Woods #1 RC",
    },
  ];

  for (const { card, title } of keeps) {
    it(`keeps ${title}`, () => {
      const valued = sharedCompValue(card, [rawBase(card, title, 6)]);
      assert.equal(valued.count, 1);
      assert.equal(valued.sales[0]?.title, title);
    });
  }

  const rejects = [
    "2025 Panini Prizm Jaxson Dart #332 Lazer",
    "2025 Panini Prizm Jaxson Dart #332 Hyper",
    "2025 Panini Prizm Jaxson Dart #332 Pulsar",
    "2025 Panini Prizm Jaxson Dart #332 Snakeskin",
    "2025 Panini Prizm Jaxson Dart #332 Neon Green",
    "2025 Panini Prizm Jaxson Dart #332 Silver Prizm",
    "2025 Panini Prizm Jaxson Dart #332 Red White Blue",
    "2025 Panini Prizm Jaxson Dart #332 Red White & Blue",
    "2025 Panini Prizm Jaxson Dart #332 Choice",
    "2025 Panini Prizm Jaxson Dart #332 No Huddle",
    "2025 Panini Prizm Jaxson Dart #332 /99",
    "2025 Panini Prizm Jaxson Dart #332 SP",
    "2025 Panini Prizm Jaxson Dart #332 Variation",
  ];

  for (const title of rejects) {
    it(`rejects ${title}`, () => {
      const valued = sharedCompValue(dart, [rawBase(dart, title, 20)]);
      assert.equal(valued.count, 0);
    });
  }

  it("keeps a second Prizm when the word before it is Base", () => {
    const valued = sharedCompValue(dart, [
      rawBase(dart, "2025 Panini Prizm Jaxson Dart #332 Base Prizm", 4),
    ]);
    assert.equal(valued.count, 1);
  });

  it("still counts a parallel word that is not part of the full player name", () => {
    const tiger = {
      playerName: "Tiger Woods",
      year: 2001,
      yearLabel: "2001",
      setBrand: "Upper Deck",
      cardNumber: "1",
      parallel: "Base",
      conditionType: "raw" as const,
      grade: "Raw",
    };
    const valued = sharedCompValue(tiger, [
      rawBase(tiger, "2001 Upper Deck Tiger Woods #1 Tiger RC", 12),
    ]);
    assert.equal(valued.count, 0);
  });

  it("matches a parallel's words in any order, ignoring and", () => {
    const pulsar = sharedCompValue(
      { ...dart, parallel: "Pulsar Green" },
      [
        rawBase(dart, "2025 Panini Prizm Jaxson Dart #332 Green Pulsar", 17),
        rawBase(dart, "2025 Panini Prizm Jaxson Dart #332 Pulsar", 13),
      ],
    );
    assert.equal(pulsar.count, 1);
    assert.equal(pulsar.median, 17);

    const flag = sharedCompValue(
      { ...dart, parallel: "Red White & Blue" },
      [
        rawBase(dart, "2025 Panini Prizm Jaxson Dart #332 Blue Red and White", 11),
        rawBase(dart, "2025 Panini Prizm Jaxson Dart #332 Red White", 8),
      ],
    );
    assert.equal(flag.count, 1);
    assert.equal(flag.median, 11);
  });
});

describe("refreshCardValue keeps a good median", () => {
  const previous = {
    status: "ok" as const,
    median: 50,
    low: 40,
    high: 60,
    nSales: 4,
    matchedAt: "2026-09-01T00:00:00.000Z",
    queryKey: "card|2025|prizm|332|Raw||Base|||",
  };
  const emptyRun = {
    status: "no_sales" as const,
    median: null,
    low: null,
    high: null,
    nSales: 0,
    matchedAt: "2026-10-18T00:00:00.000Z",
    queryKey: previous.queryKey,
  };

  it("keeps $50 and stamps matched_at when the query key is unchanged", () => {
    const decision = refreshCardValueResult(previous, emptyRun);
    const next = decision.value;
    assert.equal(decision.keptPreviousMedian, true);
    assert.equal(next.median, 50);
    assert.equal(next.low, 40);
    assert.equal(next.high, 60);
    assert.equal(next.nSales, 4);
    assert.equal(next.status, "ok");
    assert.equal(next.matchedAt, "2026-10-18T00:00:00.000Z");
    assert.notEqual(next.matchedAt, previous.matchedAt);
    assert.equal(
      amountFromStoredCompValue({
        status: next.status,
        median: next.median,
        low: next.low,
        high: next.high,
        nSales: next.nSales,
        matchedAt: next.matchedAt,
      }),
      50,
    );
  });

  it("writes no_sales when the query key changed", () => {
    const decision = refreshCardValueResult(previous, {
      ...emptyRun,
      queryKey: "card|2025|prizm|332|PSA|10|Silver|||",
    });
    assert.equal(decision.keptPreviousMedian, false);
    assert.equal(decision.value.status, "no_sales");
    assert.equal(decision.value.median, null);
    assert.equal(decision.value.nSales, 0);
  });

  it("writes no_sales when the card has no previous row", () => {
    const decision = refreshCardValueResult(null, emptyRun);
    assert.equal(decision.keptPreviousMedian, false);
    assert.equal(decision.value.status, "no_sales");
    assert.equal(decision.value.median, null);
    assert.equal(decision.value.nSales, 0);
    assert.equal(decision.value.matchedAt, emptyRun.matchedAt);
  });

  it("stamps matched_at when a failed attempt keeps the old price", () => {
    const stamped = preserveValueOnFailedAttempt(previous, "2026-10-19T09:00:00.000Z");
    assert.equal(stamped.median, 50);
    assert.equal(stamped.nSales, 4);
    assert.equal(stamped.matchedAt, "2026-10-19T09:00:00.000Z");
    assert.notEqual(stamped.matchedAt, previous.matchedAt);
  });

  it("keeps the last good price when a refresh errors and the query key is unchanged", () => {
    const kept = valueAfterRefreshError(previous, previous.queryKey, "2026-10-19T09:00:00.000Z");
    assert.equal(kept.keep, true);
    assert.equal(kept.median, 50);
    assert.equal(kept.nSales, 4);
    assert.equal(kept.status, "ok");
    assert.equal(kept.queryKey, previous.queryKey);
    assert.equal(
      formatCardValueLabel({
        status: kept.status,
        median: kept.median,
        low: kept.low,
        high: kept.high,
        nSales: kept.nSales,
        matchedAt: kept.matchedAt,
      }),
      "$50.00",
    );
  });

  it("keeps the old price when a refresh errors and the saved row has no card key", () => {
    const kept = valueAfterRefreshError(
      { ...previous, queryKey: null },
      previous.queryKey,
      "2026-10-19T09:00:00.000Z",
    );
    assert.equal(kept.keep, true);
    assert.equal(kept.median, 50);
    assert.equal(kept.low, 40);
    assert.equal(kept.high, 60);
    assert.equal(kept.nSales, 4);
    assert.equal(kept.status, "ok");
    assert.equal(
      formatCardValueLabel({
        status: kept.status,
        median: kept.median,
        low: kept.low,
        high: kept.high,
        nSales: kept.nSales,
        matchedAt: kept.matchedAt,
      }),
      "$50.00",
    );
  });

  it("never shows the old price when a refresh errors and the query key changed", () => {
    const dropped = valueAfterRefreshError(
      previous,
      "card|2025|prizm|332|PSA|10|Silver|||",
      "2026-10-19T09:00:00.000Z",
    );
    assert.equal(dropped.keep, false);
    assert.equal(dropped.median, null);
    assert.equal(dropped.nSales, 0);
    assert.equal(dropped.status, "unavailable");
    assert.equal(
      formatCardValueLabel({
        status: dropped.status,
        median: dropped.median,
        low: dropped.low,
        high: dropped.high,
        nSales: dropped.nSales,
        matchedAt: dropped.matchedAt,
      }),
      "Value unavailable right now",
    );
    assert.equal(
      formatCardValueLabel({
        status: "stale",
        median: previous.median,
        low: previous.low,
        high: previous.high,
        nSales: previous.nSales,
        matchedAt: previous.matchedAt,
      }),
      "Value unavailable right now",
    );
  });
});

function assertWholeCents(...values: Array<number | null | undefined>) {
  for (const value of values) {
    assert.equal(value != null && Number.isFinite(value), true);
    const cents = Math.round((value as number) * 100);
    assert.equal(value, cents / 100);
  }
}

describe("low-value cards stay in cents", () => {
  function listing(itemId: string, soldPrice: number): CompListing {
    return {
      id: itemId,
      itemId,
      title: "2025 Panini Prizm Jaxson Dart #332",
      soldPrice,
      soldDate: "2026-10-01",
      platform: "eBay",
      condition: "Raw",
      shipping: null,
      url: "",
    };
  }

  it("median of $1.50, $2.00, $2.25 is $2.00, with p25 and p75 in cents", () => {
    const prices = [1.5, 2, 2.25];
    const band = middleFifty(prices);
    assert.equal(band.median, 2);
    assert.equal(band.p25, 1.75);
    assert.equal(band.p75, 2.13);
    const shown = screenValueFromComps(prices.map((price, index) => listing(String(index), price)));
    assert.equal(shown.median, 2);
    assert.equal(shown.low, 1.75);
    assert.equal(shown.high, 2.13);
    assert.equal(shown.count, shown.comps.length);
    assert.equal(money(shown.median!), "$2.00");
  });

  it("median of $1.99 and $2.00 is a whole cent, never 1.995", () => {
    const prices = [1.99, 2];
    const band = middleFifty(prices);
    assert.equal(band.median, 2);
    assert.notEqual(band.median, 1.995);
    assert.equal(money(band.median!), "$2.00");
    assertWholeCents(band.median, band.p25, band.p75);

    const comps = prices.map((price, index) => listing(String(index), price));
    const shown = valueFromShownSales(comps);
    const saved = pricePayloadWithoutFlags(
      {
        comps,
        history: [],
        median: 1.995,
        p25: 1.9925,
        p75: 1.9975,
        count: 2,
        source: "trawl",
        cached: true,
        fetchedAt: null,
        query: "test",
        lowConfidence: true,
        sample: false,
      },
      new Set(["none"]),
    );
    assert.equal(shown.median, band.median);
    assert.equal(shown.low, band.p25);
    assert.equal(shown.high, band.p75);
    assert.equal(saved.median, shown.median);
    assert.equal(saved.p25, shown.low);
    assert.equal(saved.p75, shown.high);
    assert.equal(saved.count, shown.nSales);
    assertWholeCents(shown.median, shown.low, shown.high, saved.p25, saved.p75);
  });

  it("percentiles are never fractional cents", () => {
    const band = middleFifty([1.1, 1.2, 1.4, 1.7]);
    assert.equal(band.p25, 1.18);
    assert.equal(band.median, 1.3);
    assert.equal(band.p75, 1.48);
    assertWholeCents(band.median, band.p25, band.p75);
    const shown = valueFromShownSales(
      [1.1, 1.2, 1.4, 1.7].map((price, index) => listing(String(index), price)),
    );
    assert.equal(shown.median, band.median);
    assert.equal(shown.low, band.p25);
    assert.equal(shown.high, band.p75);
    assertWholeCents(shown.median, shown.low, shown.high);
  });

  it("median of $0.99 and $1.49 is $1.24", () => {
    const band = middleFifty([0.99, 1.49]);
    assert.equal(band.median, 1.24);
    assert.equal(money(band.median!), "$1.24");
    const shown = screenValueFromComps([listing("a", 0.99), listing("b", 1.49)]);
    assert.equal(shown.median, 1.24);
    assert.equal(shown.count, 2);
  });

  it("excluding a flagged sale changes the median and N together", () => {
    const comps = [listing("a", 1.5), listing("b", 2), listing("c", 2.25)];
    const before = screenValueFromComps(comps);
    const after = screenValueFromComps(comps, new Set(["c"]));
    assert.equal(before.median, 2);
    assert.equal(before.count, 3);
    assert.equal(after.count, after.comps.length);
    assert.equal(after.count, 2);
    assert.notEqual(after.median, before.median);
    assert.equal(after.median, 1.75);
    assert.equal(countForSalesLabel(before.count, after.comps.length), after.comps.length);
  });
});

describe("one price for Jaxson Dart", () => {
  const dartId = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
  const queryKey = `${dartId}|2025|panini prizm|332|Raw||Base|||`;
  const halfDollar = {
    status: "ok" as const,
    median: 112.5,
    low: 100,
    high: 130,
    nSales: 4,
    matchedAt: "2026-10-19T12:00:00.000Z",
    queryKey,
  };

  it("persists 112.50 and formats it the same on the page, grid, and preview", () => {
    const decision = refreshCardValueResult(null, halfDollar);
    assert.equal(decision.keptPreviousMedian, false);
    assert.equal(decision.value.median, 112.5);
    const stored = {
      status: decision.value.status,
      median: decision.value.median,
      low: decision.value.low,
      high: decision.value.high,
      nSales: decision.value.nSales,
      matchedAt: decision.value.matchedAt,
    };
    const page = formatCardValueLabel(stored);
    const grid = formatCardValueLabel(stored);
    const preview = previewValueLabelFromSources({ stored });
    const attachment = attachmentValueLabel(stored);
    assert.equal(page, "$112.50");
    assert.equal(grid, page);
    assert.equal(preview, page);
    assert.equal(attachment, page);
    assert.equal(money(decision.value.median!), page);
  });
});
