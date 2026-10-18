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

/**
 * A new run that kept zero sales must not replace a good "ok" median.
 * Status stays "ok" and matched_at stays put, so Collection totals and
 * snapshots keep the last price. A "stale" status would drop out of totals
 * and would queue the card on every refresh.
 */
export function refreshCardValueResult(
  previous: Pick<
    CardValueResult,
    "status" | "median" | "low" | "high" | "nSales" | "matchedAt"
  > | null,
  next: RefreshCardValueDraft,
): RefreshCardValueDraft {
  const keepPrevious =
    previous != null &&
    previous.status === "ok" &&
    previous.median != null &&
    Number.isFinite(previous.median) &&
    previous.nSales >= 1 &&
    next.nSales < 1 &&
    next.status !== "unavailable";

  if (!keepPrevious || previous == null || previous.median == null) return next;

  return {
    status: "ok",
    median: previous.median,
    low: previous.low,
    high: previous.high,
    nSales: previous.nSales,
    matchedAt: previous.matchedAt ?? next.matchedAt,
    queryKey: next.queryKey,
  };
}
