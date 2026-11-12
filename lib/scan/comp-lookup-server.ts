import "server-only";

import { unstable_cache } from "next/cache";
import { loadSharedQuickComp, QuickCompFailure, type CacheFn } from "@/lib/quick-comp/cache";
import { toSoldCompCard } from "@/lib/quick-comp/identity";
import type { QuickCompPayload } from "@/lib/quick-comp/lookup";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { readPriceContext } from "@/lib/value/price-context";
import type { ScanCompDeps } from "./comp-lookup";
import { makeLiveCacheRead } from "./live-search";
import { searchCachedSoldTitles } from "./sold-titles-server";

/** Not a real card. The price context needs an id; this one matches no row. */
const SCANNED_CARD_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Cache-only reads. The quick comp loader refuses on a miss, and a refusal is
 * never stored, so a scan never fetches, never spends a cap and never calls Trawl.
 */
export const serverScanCompDeps: ScanCompDeps = {
  async quickCompCache(identity) {
    try {
      return await loadSharedQuickComp<QuickCompPayload>(
        identity,
        async () => {
          throw new QuickCompFailure("unavailable");
        },
        unstable_cache as CacheFn,
      );
    } catch (error) {
      if (error instanceof QuickCompFailure) return null;
      throw error;
    }
  },
  soldCache: searchCachedSoldTitles,
  liveCache: makeLiveCacheRead(unstable_cache as CacheFn),
  directory: INDEXED_DIRECTORY,
  async collectionSales(identity, viewerId) {
    const card = { ...toSoldCompCard(identity), id: SCANNED_CARD_ID };
    const context = await readPriceContext(card, viewerId);
    return context.sales;
  },
};
