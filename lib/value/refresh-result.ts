import type { CardValueResult, CardValueStatus } from "./types";

export type RefreshCardValueDraft = {
  status: CardValueStatus;
  median: number | null;
  low: number | null;
  high: number | null;
  nSales: number;
  matchedAt: string;
  queryKey: string;
};

export type RefreshCardValueDecision = {
  value: RefreshCardValueDraft;
  keptPreviousMedian: boolean;
};

/**
 * Keep a good "ok" median only when this run found no sales and the card
 * identity (query_key) did not change. Status stays "ok" so totals still
 * count it. matched_at moves to now so the daily refresh does not pick the
 * same card first on every run. An edit that changes the key writes the new
 * result, including no_sales.
 */
export function refreshCardValueResult(
  previous: (Pick<
    CardValueResult,
    "status" | "median" | "low" | "high" | "nSales" | "matchedAt"
  > & { queryKey: string | null }) | null,
  next: RefreshCardValueDraft,
): RefreshCardValueDecision {
  const sameCard =
    previous != null &&
    previous.queryKey != null &&
    previous.queryKey === next.queryKey;
  const keepPrevious =
    sameCard &&
    previous.status === "ok" &&
    previous.median != null &&
    Number.isFinite(previous.median) &&
    previous.nSales >= 1 &&
    next.nSales < 1 &&
    next.status !== "unavailable";

  if (!keepPrevious || previous == null || previous.median == null) {
    return { value: next, keptPreviousMedian: false };
  }

  return {
    keptPreviousMedian: true,
    value: {
      status: "ok",
      median: previous.median,
      low: previous.low,
      high: previous.high,
      nSales: previous.nSales,
      matchedAt: next.matchedAt,
      queryKey: next.queryKey,
    },
  };
}
