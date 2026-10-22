import "server-only";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import {
  COMPS_RESULT_REVALIDATE_SECONDS,
  compsResultCacheKey,
  compsResultCacheTag,
} from "@/lib/comps/comps-result-cache";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import type { SoldCompCard } from "@/lib/comps/types";
import { cardCacheTag, revalidateCardCache } from "./card-cache";
import {
  getCardValue,
  refreshCardValue,
  type RefreshCardValueOptions,
  type RefreshCardValueResult,
} from "./getCardValue";
import type { CardValueResult } from "./types";

/** How long a repeat card view can reuse comps before asking the database again. */
export const CARD_MARKET_REVALIDATE_SECONDS = 300;

export class CardMarketUnavailable extends Error {
  readonly result: RefreshCardValueResult;

  constructor(result: RefreshCardValueResult) {
    super(result.attempt.reason);
    this.name = "CardMarketUnavailable";
    this.result = result;
  }
}

/**
 * Bust `card:${id}` and the card page after a write (flag/undo/restore/refresh).
 * Does not include flags, hidden sales, or paid in the cached payload.
 */
export function revalidateCard(cardId: string): void {
  if (!cardId) return;
  try {
    revalidateCardCache(cardId, revalidateTag);
    revalidateTag(compsResultCacheTag(cardId), { expire: 0 });
    revalidatePath(`/cards/${cardId}`);
  } catch (err) {
    console.warn(
      "[card-market] cache bust failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Card row for the comps cache key. A hit does not select `cards` again. */
function loadCachedSoldCompCard(cardId: string): Promise<SoldCompCard | null> {
  return unstable_cache(
    () => loadSoldCompCard(cardId),
    ["sold-comp-card", cardId],
    { tags: [cardCacheTag(cardId)], revalidate: COMPS_RESULT_REVALIDATE_SECONDS },
  )();
}

/**
 * Shared comps refresh for the card page. Owner flags are already applied
 * inside refreshCardValue; the hidden-sale list and paid price are not returned.
 * Failures are thrown so Next does not cache them.
 */
export async function loadCachedCardRefresh(
  cardId: string,
  options?: RefreshCardValueOptions,
): Promise<RefreshCardValueResult> {
  const save = options?.save !== false;
  const cacheOnly = Boolean(options?.cacheOnly);
  const card = await loadCachedSoldCompCard(cardId);
  const identity = card ? compsResultCacheKey(card) : `missing|${cardId}`;
  return unstable_cache(
    async () => {
      const result = await refreshCardValue(cardId, { ...options, card });
      if (result.attempt.reason === "budget_exhausted" || !result.payload) {
        throw new CardMarketUnavailable(result);
      }
      return {
        status: result.status,
        median: result.median,
        low: result.low,
        high: result.high,
        nSales: result.nSales,
        matchedAt: result.matchedAt,
        attempt: result.attempt,
        payload: result.payload,
      };
    },
    ["card-market", identity, save ? "save" : "read", cacheOnly ? "cache" : "live"],
    { tags: [cardCacheTag(cardId)], revalidate: COMPS_RESULT_REVALIDATE_SECONDS },
  )();
}

/** Stored card_values row for repeat views. Same tag as the comps cache. */
export function loadCachedCardValue(cardId: string): Promise<CardValueResult | null> {
  return unstable_cache(
    () => getCardValue(cardId),
    ["card-value", cardId],
    { tags: [cardCacheTag(cardId)], revalidate: CARD_MARKET_REVALIDATE_SECONDS },
  )();
}
