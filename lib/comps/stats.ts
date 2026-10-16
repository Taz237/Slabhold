/** Inclusive percentile via linear interpolation on a sorted copy. */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const t = rank - lo;
  return sortedAsc[lo] * (1 - t) + sortedAsc[hi] * t;
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

/** Drop sales more than 2.5× or less than 0.4× the median price. */
export function filterPriceOutliers<T extends { price: number }>(sales: T[]): T[] {
  if (sales.length < 2) return sales;
  const mid = median(sales.map((s) => s.price));
  if (mid == null || mid <= 0) return sales;
  const lo = mid * 0.4;
  const hi = mid * 2.5;
  return sales.filter((s) => s.price >= lo && s.price <= hi);
}
