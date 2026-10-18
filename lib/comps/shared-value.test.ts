import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import type { CompListing } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import {
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
