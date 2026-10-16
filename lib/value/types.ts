export type CardValueStatus =
  | "ok"
  | "no_sales"
  | "stale"
  | "unavailable"
  | "sample";

export type CardValueResult = {
  status: CardValueStatus;
  median: number | null;
  low: number | null;
  high: number | null;
  nSales: number;
  matchedAt: string | null;
};

/** Values older than this (or missing / query_key mismatch) are refresh candidates. */
export const VALUE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
