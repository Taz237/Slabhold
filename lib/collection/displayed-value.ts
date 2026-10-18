import { summarize } from "@/lib/portfolio";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

/**
 * Estimated value for Collection and Home "Your collection today".
 * summarize only counts medians from sharedCompValue (at least one matching sale).
 */
export function displayedCollectionTotal(
  cards: SportsCard[],
  values?: Map<string, CardValueResult>,
): number {
  return summarize(cards, values).estimatedValue;
}
