export type CardValueStatus =
  | "ok"
  | "no_sales"
  | "stale"
  | "unavailable"
  | "sample";

/** One sold price used only when the normal estimate is too thin. */
export type CardValueSale = {
  price: number;
  soldAt?: string | null;
};

/**
 * Sales of a nearby card. `detail` names that card's year, parallel, or grade.
 * `href` opens that card. This is not an estimate of the card on screen.
 */
export type CardValueSimilar = {
  href: string;
  detail: string;
  priceText: string;
  reason: "parallel" | "grade" | "year";
};

export type CardValueResult = {
  status: CardValueStatus;
  median: number | null;
  low: number | null;
  high: number | null;
  nSales: number;
  matchedAt: string | null;
  /** Exact-card sales. Present when the stored median is not the estimate. */
  sales?: CardValueSale[];
  /** Null when no similar public card has sales. */
  similar?: CardValueSimilar | null;
};

/** Values older than this (or missing / query_key mismatch) are refresh candidates. */
export const VALUE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
