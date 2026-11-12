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

/**
 * Dev only: each rung's query, how many results came back, how many were kept,
 * and why the rest were dropped, so a missing sale can be traced. Card names
 * only; no user ids. Off in production.
 */
const devLog: LiveSoldsDeps["log"] =
  process.env.NODE_ENV === "production" ? undefined : (event) => console.info("[scan-solds]", JSON.stringify(event));

export const serverLiveSoldsDeps: LiveSoldsDeps = {
  log: devLog,
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
    // Production too: which search failed and why (card names, status, reason). Never a user or the key.
    warn: (event) => console.warn("[scan-live] search failed", JSON.stringify(event)),
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
