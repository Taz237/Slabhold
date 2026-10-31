import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { TRENDING_CACHE_SECONDS, type TrendingItem } from "./trending";
import { loadTrendingNow, type TrendingDb } from "./trending-read";

/**
 * One shared ranking for every viewer. Blocked authors and posts the
 * viewer cannot read are removed on the client.
 * A successful read is cached for about five minutes.
 * A thrown read is not cached; the route answers private, no-store.
 */
export async function getTrendingNow(): Promise<TrendingItem[]> {
  return unstable_cache(
    () => loadTrendingNow(createSupabaseAdmin() as unknown as TrendingDb | null, new Date()),
    ["trending-now-v2"],
    { revalidate: TRENDING_CACHE_SECONDS },
  )();
}
