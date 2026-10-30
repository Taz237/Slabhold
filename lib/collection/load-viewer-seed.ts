import "server-only";

import { mergeCategories } from "@/lib/card-category";
import { readCardValueHistory, readCollectionSnapshots } from "@/lib/collection/value-history-read";
import { consumeCardValueLimit } from "@/lib/comps/rate-limit";
import { loadUserCards } from "@/lib/social/cards";
import { loadSocialProfiles } from "@/lib/social/remote";
import type { RequestViewer } from "@/lib/supabase/request-viewer";
import { MAX_CARD_VALUE_IDS } from "@/lib/value/card-value-access";
import { lookupAllowedIds, readCardValues } from "@/lib/value/read-card-values";
import type { CardValueResult } from "@/lib/value/types";
import { cardValuesKey, type CollectionSeed, type ViewerSeed } from "./viewer-seed";

/**
 * The viewer's profile and cards with their own cookie client: the same
 * reads the social and collection providers make, under the same RLS.
 * Null when either read fails, so the page loads in the browser as before.
 */
export async function loadViewerSeed(viewer: RequestViewer): Promise<ViewerSeed | null> {
  try {
    const [people, cards] = await Promise.all([
      loadSocialProfiles(viewer.supabase, [viewer.id], viewer),
      loadUserCards(viewer.supabase, viewer.id),
    ]);
    const user = people.find((profile) => profile.id === viewer.id);
    if (!user) return null;
    return { viewer: user, cards: mergeCategories(cards).cards };
  } catch (error) {
    console.warn("[seed] viewer read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Card values the way /api/card-values serves them: the same batches, the
 * same rate-limit token per batch, the same owner and public filter.
 * Null when a batch is rate-limited: the browser asks again and gets the
 * usual "too many price checks" state.
 */
async function seedValues(ids: string[], userId: string): Promise<Record<string, CardValueResult> | null> {
  const sorted = cardValuesKey(ids).split(",").filter(Boolean);
  const values: Record<string, CardValueResult> = {};
  for (let index = 0; index < sorted.length; index += MAX_CARD_VALUE_IDS) {
    if (!(await consumeCardValueLimit(userId))) return null;
    const batch = sorted.slice(index, index + MAX_CARD_VALUE_IDS);
    Object.assign(values, await readCardValues(await lookupAllowedIds(batch, userId), userId));
  }
  return values;
}

/** Collection's first screen: cards, then their values, alongside the chart's history. */
export async function loadCollectionSeed(viewer: RequestViewer): Promise<CollectionSeed | null> {
  const [base, snapshots, history] = await Promise.all([
    loadViewerSeed(viewer),
    readCollectionSnapshots(viewer.supabase),
    readCardValueHistory(viewer.supabase),
  ]);
  if (!base) return null;
  let values: Record<string, CardValueResult> | null = null;
  try {
    values = await seedValues(
      base.cards.map((card) => card.id),
      viewer.id,
    );
  } catch {
    values = null;
  }
  return { ...base, values, snapshots, cardHistory: history ? [...history.entries()] : null };
}
