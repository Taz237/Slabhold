import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CACHE_TTL_MS } from "./cache-ttl";
import {
  previewValueLabelFromSources,
  selectFreshMatchingCompsSales,
} from "./preview-value";
import type { MatchCard } from "./match";
import type { CleanedSale } from "./types";
import type { CardValueResult } from "@/lib/value/types";

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

const BASE_KEY = "ba95893e-89fe-4735-be3f-1509b6b6f3b9|2025|panini prizm|332|Raw||Base|||";
const SILVER_KEY =
  "ba95893e-89fe-4735-be3f-1509b6b6f3b9|2025|panini prizm|332|Raw||Silver|||";

function sale(
  title: string,
  price: number,
  itemId: string,
): CleanedSale {
  return {
    itemId,
    title,
    price,
    currency: "$",
    soldAt: "2026-09-01T00:00:00.000Z",
    grader: null,
    grade: null,
    url: `https://www.ebay.com/itm/${itemId}`,
  };
}

/** Parallel-only sales that price near $10 when treated as a batch. */
const PARALLEL_TEN_SALES: CleanedSale[] = [
  sale("2025 Panini Prizm Jaxson Dart #332 RC Silver Prizm", 10, "silver-a"),
  sale("2025 Panini Prizm Jaxson Dart #332 RC Silver Prizm", 10, "silver-b"),
  sale("2025 Panini Prizm Jaxson Dart #332 RC Silver Prizm", 10, "silver-c"),
];

const STORED_THREE: CardValueResult = {
  status: "ok",
  median: 3,
  low: 2,
  high: 4,
  nSales: 9,
  matchedAt: "2026-10-18T00:00:00.000Z",
};

describe("share preview comps freshness", () => {
  const nowMs = Date.parse("2026-10-18T12:00:00.000Z");

  it("ignores a stale same-key batch with $10 parallel sales and uses stored $3", () => {
    const staleFetchedAt = new Date(nowMs - CACHE_TTL_MS - 1).toISOString();
    const label = previewValueLabelFromSources({
      card: DART_BASE,
      expectedQueryKey: BASE_KEY,
      batch: {
        queryKey: BASE_KEY,
        sales: PARALLEL_TEN_SALES,
        fetchedAt: staleFetchedAt,
      },
      stored: STORED_THREE,
      nowMs,
    });
    assert.equal(label, "$3");
    assert.equal(
      selectFreshMatchingCompsSales({
        expectedQueryKey: BASE_KEY,
        batch: {
          queryKey: BASE_KEY,
          sales: PARALLEL_TEN_SALES,
          fetchedAt: staleFetchedAt,
        },
        nowMs,
      }),
      null,
    );
  });

  it("ignores an other-key fresh batch with $10 parallel sales and uses stored $3", () => {
    const freshFetchedAt = new Date(nowMs - 60_000).toISOString();
    const label = previewValueLabelFromSources({
      card: DART_BASE,
      expectedQueryKey: BASE_KEY,
      batch: {
        queryKey: SILVER_KEY,
        sales: PARALLEL_TEN_SALES,
        fetchedAt: freshFetchedAt,
      },
      stored: STORED_THREE,
      nowMs,
    });
    assert.equal(label, "$3");
  });

  it("excludes owner Not a match sales before pricing a fresh batch", () => {
    const freshFetchedAt = new Date(nowMs - 60_000).toISOString();
    const baseSales = [
      sale("2025 Panini Prizm Jaxson Dart #332 Rookie RC Giants", 3, "keep-a"),
      sale("2025 Panini Prizm #332 Jaxson Dart RC Base", 3, "keep-b"),
      sale("2025 Panini Prizm Jaxson Dart #332 Rookie", 40, "flagged"),
    ];
    const label = previewValueLabelFromSources({
      card: DART_BASE,
      expectedQueryKey: BASE_KEY,
      batch: {
        queryKey: BASE_KEY,
        sales: baseSales,
        fetchedAt: freshFetchedAt,
      },
      hiddenItemIds: new Set(["flagged"]),
      stored: STORED_THREE,
      nowMs,
    });
    assert.equal(label, "$3.00");
  });

  it("prices a fresh same-key batch when it matches", () => {
    const freshFetchedAt = new Date(nowMs - 60_000).toISOString();
    const label = previewValueLabelFromSources({
      card: DART_BASE,
      expectedQueryKey: BASE_KEY,
      batch: {
        queryKey: BASE_KEY,
        sales: [
          sale("2025 Panini Prizm Jaxson Dart #332 Rookie RC Giants", 3, "a"),
          sale("2025 Panini Prizm #332 Jaxson Dart RC Base", 3, "b"),
        ],
        fetchedAt: freshFetchedAt,
      },
      stored: {
        status: "ok",
        median: 99,
        low: 99,
        high: 99,
        nSales: 1,
        matchedAt: "2026-10-01T00:00:00.000Z",
      },
      nowMs,
    });
    assert.equal(label, "$3.00");
  });
});
