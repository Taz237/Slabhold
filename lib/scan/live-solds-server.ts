import "server-only";

import { unstable_cache } from "next/cache";
import { loadProductData } from "@/lib/cards/product-data";
import { getCompsSource, payloadFromSales } from "@/lib/comps";
import { fetchTrawlSold, getTrawlApiKey } from "@/lib/comps/trawl";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { loadSharedQuickComp, type CacheFn } from "@/lib/quick-comp/cache";
import type { QuickCompPayload } from "@/lib/quick-comp/lookup";
import { serverQuickCompLimits } from "@/lib/quick-comp/limits-server";
import { pickQuickCompPhoto } from "@/lib/quick-comp/photo";
import { serverScanCompDeps } from "./comp-lookup-server";
import { makeLiveCacheRead, makeLiveSearch } from "./live-search";
import type { LiveSoldsDeps } from "./live-solds";
import { searchCachedSoldTitles } from "./sold-titles-server";

const cache = unstable_cache as CacheFn;

/** Reads the shared cache for a search the sheet already ran. Never Trawl. */
export const readLiveCache = makeLiveCacheRead(cache);

export const serverLiveSoldsDeps: LiveSoldsDeps = {
  directory: INDEXED_DIRECTORY,
  products: loadProductData,
  cachedTitles: searchCachedSoldTitles,
  quickCompCache: serverScanCompDeps.quickCompCache,
  liveSearch: makeLiveSearch({
    source: getCompsSource,
    hasTrawlKey: () => Boolean(getTrawlApiKey()),
    fetchSold: fetchTrawlSold,
    limits: serverQuickCompLimits,
    cache,
    now: Date.now,
  }),
  /** Same entry Quick Comp reads, so the next scan or Quick Comp of this card spends nothing. */
  async storeQuickComp(identity, sales, results, meta) {
    await loadSharedQuickComp<QuickCompPayload>(
      identity,
      async () => ({
        ...payloadFromSales(sales, { source: "trawl", cached: false, fetchedAt: meta.fetchedAt, query: meta.query }),
        photo: pickQuickCompPhoto(sales, results, identity.grade),
      }),
      cache,
    );
  },
};
