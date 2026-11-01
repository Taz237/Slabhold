import type { PortfolioTotals } from "@/lib/portfolio";

export type CollectionTotals = {
  value: number;
  invested: number;
  profit: number;
};

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

let newYorkDay: Intl.DateTimeFormat | null = null;

/** Calendar date in America/New_York as YYYY-MM-DD. One formatter, made on first use. */
export function snapshotDateInNewYork(now: Date = new Date()): string {
  newYorkDay ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return newYorkDay.format(now);
}
