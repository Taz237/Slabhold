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

export type StoredValueOnError = {
  status: CardValueStatus;
  median: number | null;
  low: number | null;
  high: number | null;
  nSales: number;
  matchedAt: string | null;
  queryKey: string | null;
};

/**
 * A refresh error keeps the last stored price only when query_key is unchanged.
 * A new key writes an empty unavailable row so the old price is never shown.
 */
export function valueAfterRefreshError(
  previous: StoredValueOnError | null,
  queryKey: string,
  attemptedAt: string,
): StoredValueOnError & { keep: boolean; matchedAt: string; queryKey: string } {
  const sameKey =
    previous != null &&
    previous.queryKey != null &&
    previous.queryKey === queryKey;
  if (sameKey && previous) {
    return {
      keep: true,
      status: previous.status,
      median: previous.median,
      low: previous.low,
      high: previous.high,
      nSales: previous.nSales,
      matchedAt: attemptedAt,
      queryKey,
    };
  }
  return {
    keep: false,
    status: "unavailable",
    median: null,
    low: null,
    high: null,
    nSales: 0,
    matchedAt: attemptedAt,
    queryKey,
  };
}

/**
 * A Trawl error left the stored price in place. matched_at still moves to this
 * attempt so the daily queue rotates. Price fields are copied through unchanged.
 */
export function preserveValueOnFailedAttempt<
  T extends {
    median: number | null;
    low: number | null;
    high: number | null;
    nSales: number;
    matchedAt: string | null;
  },
>(previous: T, attemptedAt: string): T {
  return { ...previous, matchedAt: attemptedAt };
}
