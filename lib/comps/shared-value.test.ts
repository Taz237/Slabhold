import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { money } from "@/lib/format";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import type { CompListing } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { refreshCardValueResult } from "@/lib/value/refresh-result";
import {
  amountFromStoredCompValue,
  displayedCompLabel,
  resolveCardScreenValue,
  sharedCompValue,
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

  it("prices the listed sales even when the stored value says no sales", () => {
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
    assert.equal(resolved.emptyLabel, null);
    assert.equal(resolved.comps?.length, 2);
    assert.deepEqual(resolved.basis, [
      { date: "2026-09-01", price: 100, grade: "PSA 10" },
      { date: "2026-09-02", price: 120, grade: "PSA 10" },
    ]);
  });

  it("hides a flagged sale from both the list and the estimate", () => {
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
    assert.deepEqual(
      resolved.comps?.map((comp) => comp.itemId),
      ["keep"],
    );
    assert.equal(resolved.basis[0]?.grade, "PSA 10");
  });

  it("drops a different grade before pricing the list", () => {
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
    });
    assert.equal(resolved.count, 1);
    assert.equal(resolved.amount, 100);
    assert.equal(resolved.basis[0]?.grade, "PSA 10");
    assert.equal(resolved.emptyLabel, null);
  });

  it("says there are not enough sales when the list is empty", () => {
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
    assert.equal(valued.median, 3);

    const blankParallel = sharedCompValue({ ...DART_BASE, parallel: "" }, DART_SALES);
    assert.equal(blankParallel.median, 3);
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

  it("prices the on-screen list from those same base sales", () => {
    const resolved = resolveCardScreenValue({
      phase: "ready",
      card: DART_BASE,
      comps: DART_SALES.map((sale) => ({
        id: sale.item_id,
        itemId: sale.item_id,
        title: sale.title,
        soldPrice: sale.sale_price,
        soldDate: sale.date_sold.slice(0, 10),
        platform: "eBay",
        condition: "Raw",
        shipping: null,
        url: sale.item_link,
      })),
    });
    assert.equal(resolved.amount, 3);
    assert.equal(resolved.count, 2);
    assert.deepEqual(
      resolved.basis.map((sale) => sale.price).sort((a, b) => a - b),
      [2.5, 3],
    );
    assert.equal(displayedCompLabel(DART_BASE, DART_SALES), money(resolved.amount!, true));
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
  it("keeps an ok $50 row when the new run has no sales", () => {
    const next = refreshCardValueResult(
      {
        status: "ok",
        median: 50,
        low: 40,
        high: 60,
        nSales: 4,
        matchedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        status: "no_sales",
        median: null,
        low: null,
        high: null,
        nSales: 0,
        matchedAt: "2026-10-18T00:00:00.000Z",
        queryKey: "card|2025|prizm|332|Raw||Base|||",
      },
    );
    assert.equal(next.median, 50);
    assert.equal(next.low, 40);
    assert.equal(next.high, 60);
    assert.equal(next.nSales, 4);
    assert.equal(next.status, "ok");
    assert.equal(next.matchedAt, "2026-09-01T00:00:00.000Z");
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
});
