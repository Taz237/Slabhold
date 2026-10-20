/**
 * Snap a dollar amount to integer cents at the boundary.
 * Median and percentile results are rounded to a whole cent before
 * they are converted back to dollars.
 */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return Number.NaN;
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** Nearest whole cent, as dollars. `cents` may be fractional after interpolation. */
export function roundCentsToDollars(cents: number): number {
  return centsToDollars(Math.round(cents));
}

/** Same whole-cent snap for a dollar amount. Null stays null. */
export function roundToCent(dollars: number | null | undefined): number | null {
  if (dollars == null || !Number.isFinite(dollars)) return dollars ?? null;
  return roundCentsToDollars(dollars * 100);
}

/** Inclusive percentile via linear interpolation. `sortedAsc` is integer cents. */
function percentileCents(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const t = rank - lo;
  return sortedAsc[lo] * (1 - t) + sortedAsc[hi] * t;
}

/**
 * Inclusive percentile via linear interpolation on a sorted copy.
 * Prices are converted to integer cents first. The interpolated result is
 * rounded to a whole cent, then converted back to dollars.
 */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  const cents = sortedAsc.map(dollarsToCents);
  const value = percentileCents(cents, p);
  return value == null ? null : roundCentsToDollars(value);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

export function middleFifty(values: number[]): {
  median: number | null;
  p25: number | null;
  p75: number | null;
} {
  if (!values.length) return { median: null, p25: null, p75: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 50),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
  };
}

/**
 * Drop sales more than 2.5× or less than 0.4× the median price.
 * Call this only after parallel matching. If the band would not be a strict
 * majority of that set, keep every sale so the real price cluster stays.
 */
export function filterPriceOutliers<T extends { price: number }>(sales: T[]): T[] {
  if (sales.length < 2) return sales;
  const cents = sales.map((sale) => dollarsToCents(sale.price));
  const mid = median(cents.map(centsToDollars));
  if (mid == null || mid <= 0) return sales;
  const midCents = dollarsToCents(mid);
  const lo = midCents * 0.4;
  const hi = midCents * 2.5;
  const kept = sales.filter((_, index) => cents[index] >= lo && cents[index] <= hi);
  if (kept.length * 2 <= sales.length) return sales;
  return kept;
}
