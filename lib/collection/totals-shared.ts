import { isSold } from "@/lib/format";
import type { PortfolioTotals } from "@/lib/portfolio";
import type { SportsCard } from "@/lib/types";

export type CollectionTotals = {
  value: number;
  invested: number;
  profit: number;
};

/** Sold cards do not count toward collection value, invested, or profit. */
export function cardsCountedInCollectionTotals(cards: SportsCard[]): SportsCard[] {
  return cards.filter((card) => !isSold(card));
}

/** Map Collection summary totals into snapshot columns. */
export function collectionTotalsFromSummarize(
  totals: PortfolioTotals,
): CollectionTotals {
  return {
    value: totals.estimatedValue,
    invested: totals.invested,
    profit: totals.unrealizedProfit + totals.realizedProfit,
  };
}

/** Calendar date in America/New_York as YYYY-MM-DD. */
export function snapshotDateInNewYork(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
