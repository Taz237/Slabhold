import { isSold } from "@/lib/format";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { TRUSTED_MIN_MEDIAN, TRUSTED_MIN_SALES } from "./math";

/** A live card value the value board will trust: two sales, median at least $5. */
export function isTrustedLeaderboardValue(
  value: CardValueResult | null | undefined,
): value is CardValueResult & { median: number } {
  if (!value) return false;
  if (value.status !== "ok" && value.status !== "sample") return false;
  if (value.nSales < TRUSTED_MIN_SALES) return false;
  if (value.median == null || !Number.isFinite(value.median)) return false;
  if (value.median < TRUSTED_MIN_MEDIAN) return false;
  return true;
}

/** Public held cards with a trusted price. Private and sold cards stay out. */
export function trustedPublicTotals(
  cards: readonly SportsCard[],
  values?: Map<string, CardValueResult>,
): { count: number; value: number } {
  let count = 0;
  let value = 0;
  for (const card of cards) {
    if (!card.isPublic || isSold(card)) continue;
    const stored = values?.get(card.id);
    if (!isTrustedLeaderboardValue(stored)) continue;
    count += 1;
    value += stored.median;
  }
  return { count, value };
}
