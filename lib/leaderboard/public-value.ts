import { amountFromStoredCompValue } from "@/lib/comps/shared-value";
import { isSold } from "@/lib/format";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

/** Public held cards that have a median. Private cards stay out of the leaderboard minimums. */
export function publicValuedTotals(
  cards: readonly SportsCard[],
  values?: Map<string, CardValueResult>,
): { count: number; value: number } {
  let count = 0;
  let value = 0;
  for (const card of cards) {
    if (!card.isPublic || isSold(card)) continue;
    const amount = amountFromStoredCompValue(values?.get(card.id));
    if (amount == null) continue;
    count += 1;
    value += amount;
  }
  return { count, value };
}
