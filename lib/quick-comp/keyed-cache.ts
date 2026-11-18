import "server-only";

import { unstable_cache } from "next/cache";
import { makeKeyedCache, type CacheFn, type UnstableCache } from "./cache";

/**
 * The shared sold-search and quick comp cache, for every writer and reader on the server. Never
 * pass `unstable_cache` itself as a CacheFn: it keys by the callback's text, so a cache-only read
 * (whose loader just refuses) would never find what a search stored (lib/quick-comp/cache.ts).
 */
export const keyedCache: CacheFn = makeKeyedCache(unstable_cache as unknown as UnstableCache);
