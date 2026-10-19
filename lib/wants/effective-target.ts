import { middleFifty } from "@/lib/comps/stats";

/** Explicit target wins. Otherwise the identity's fair-price low (rounded p25). */
export function effectiveTarget(
  explicit: number | null | undefined,
  fairLow: number | null | undefined,
): number | null {
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) return explicit;
  if (fairLow != null && Number.isFinite(fairLow) && fairLow > 0) return fairLow;
  return null;
}

/** Same rounded 25th percentile card_values.low stores for a card. */
export function fairLowFromPrices(prices: readonly number[]): number | null {
  const finite = prices.filter((price) => Number.isFinite(price) && price >= 0);
  if (!finite.length) return null;
  const { p25 } = middleFifty(finite);
  if (p25 == null || !Number.isFinite(p25)) return null;
  const rounded = Math.round(p25);
  return rounded > 0 ? rounded : null;
}

export function targetFlag(
  value: number,
  target: number,
): "below" | "at" | "above" {
  if (value < target) return "below";
  if (value > target) return "above";
  return "at";
}
