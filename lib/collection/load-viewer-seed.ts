import "server-only";

import { mergeCategories } from "@/lib/card-category";
import { readCardValueHistory, readCollectionSnapshots } from "@/lib/collection/value-history-read";
import { loadUserCards } from "@/lib/social/cards";
import { loadSocialProfiles } from "@/lib/social/remote";
import type { RequestViewer } from "@/lib/supabase/request-viewer";
import { type CollectionSeed, type ViewerSeed } from "./viewer-seed";

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
 * Collection's first screen: cards and the chart's history. Prices are not
 * read here: on a cache miss they wait on a price lookup per card, and the
 * whole screen used to wait with them. The browser reads them right after
 * (useCardValues), with the price skeletons showing meanwhile.
 */
export async function loadCollectionSeed(viewer: RequestViewer): Promise<CollectionSeed | null> {
  const [base, snapshots, history] = await Promise.all([
    loadViewerSeed(viewer),
    readCollectionSnapshots(viewer.supabase),
    readCardValueHistory(viewer.supabase),
  ]);
  if (!base) return null;
  return { ...base, values: null, snapshots, cardHistory: history ? [...history.entries()] : null };
}
