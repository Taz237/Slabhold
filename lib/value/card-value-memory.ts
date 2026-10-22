import type { CardValueResult } from "./types";

/**
 * Last trusted card_values read in this tab.
 * The collection grid and the card page each own a hook, so without this the
 * detail screen starts blank and waits on /api/card-values again.
 */
const memory = new Map<string, CardValueResult>();

export function rememberCardValues(values: ReadonlyMap<string, CardValueResult>) {
  for (const [id, value] of values) {
    if (id && value) memory.set(id, value);
  }
}

export function peekCardValue(cardId: string): CardValueResult | null {
  return memory.get(cardId) ?? null;
}
