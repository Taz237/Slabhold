import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { CACHE_TTL_MS } from "./cache-ttl";
import type { CleanedSale } from "./types";

export { CACHE_TTL_MS };

export type CachedSoldBatch = {
  sales: CleanedSale[];
  fetchedAt: string;
};

type CacheRow = {
  item_id: string;
  title: string | null;
  price: number;
  currency: string | null;
  sold_at: string | null;
  grader: string | null;
  grade: string | null;
  url: string | null;
  fetched_at: string;
};

export async function readSoldCompsCache(
  queryKey: string,
): Promise<CachedSoldBatch | null> {
  const client = createSupabaseAdmin();
  if (!client) return null;

  const { data: latest, error: latestError } = await client
    .from("sold_comps_cache")
    .select("fetched_at")
    .eq("query_key", queryKey)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError || !latest?.fetched_at) return null;

  const fetchedAt = latest.fetched_at as string;
  const age = Date.now() - new Date(fetchedAt).getTime();
  if (Number.isNaN(age) || age > CACHE_TTL_MS) return null;

  const { data, error } = await client
    .from("sold_comps_cache")
    .select(
      "item_id, title, price, currency, sold_at, grader, grade, url, fetched_at",
    )
    .eq("query_key", queryKey)
    .eq("fetched_at", fetchedAt);

  if (error || !data?.length) {
    return { sales: [], fetchedAt };
  }

  return {
    sales: rowsToSales(data as CacheRow[], fetchedAt),
    fetchedAt,
  };
}

/** Item ids already stored for this query, including stale batches. Null on read error. */
export async function listCachedItemIds(
  queryKey: string,
): Promise<Set<string> | null> {
  const client = createSupabaseAdmin();
  if (!client || !queryKey) return new Set();

  const { data, error } = await client
    .from("sold_comps_cache")
    .select("item_id")
    .eq("query_key", queryKey);

  if (error) {
    console.warn("[sold_comps_cache] list failed:", error.message);
    return null;
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const itemId = row.item_id as string;
    if (itemId && itemId !== "__empty__") ids.add(itemId);
  }
  return ids;
}

/** Latest stored batch, even when the 6h cache TTL has passed. Null when none exists. */
export async function readLatestSoldCompsBatch(
  queryKey: string,
): Promise<CachedSoldBatch | null> {
  const client = createSupabaseAdmin();
  if (!client || !queryKey) return null;

  const { data: latest, error: latestError } = await client
    .from("sold_comps_cache")
    .select("fetched_at")
    .eq("query_key", queryKey)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError || !latest?.fetched_at) return null;

  const fetchedAt = latest.fetched_at as string;
  const { data, error } = await client
    .from("sold_comps_cache")
    .select(
      "item_id, title, price, currency, sold_at, grader, grade, url, fetched_at",
    )
    .eq("query_key", queryKey)
    .eq("fetched_at", fetchedAt);

  if (error || !data?.length) return { sales: [], fetchedAt };
  return { sales: rowsToSales(data as CacheRow[], fetchedAt), fetchedAt };
}

/** Latest stored matched sales, even when the 6h cache TTL has passed. */
export async function readLatestSoldComps(queryKey: string): Promise<CleanedSale[]> {
  const batch = await readLatestSoldCompsBatch(queryKey);
  return batch?.sales ?? [];
}

function rowsToSales(data: CacheRow[], fetchedAt: string): CleanedSale[] {
  return data
    .filter((row) => row.item_id !== "__empty__")
    .map((row) => ({
      itemId: row.item_id,
      title: row.title?.trim() || "",
      price: Number(row.price),
      currency: row.currency,
      soldAt: row.sold_at ?? fetchedAt,
      grader: row.grader,
      grade: row.grade,
      url: row.url ?? "",
    }));
}

export async function writeSoldCompsCache(
  cardId: string,
  queryKey: string,
  sales: CleanedSale[],
): Promise<string | null> {
  const client = createSupabaseAdmin();
  if (!client) return null;

  const fetchedAt = new Date().toISOString();

  const { error: deleteError } = await client
    .from("sold_comps_cache")
    .delete()
    .eq("query_key", queryKey);

  if (deleteError) {
    console.warn("[sold_comps_cache] delete failed:", deleteError.message);
  }

  const rows =
    sales.length > 0
      ? sales.map((sale) => ({
          card_id: cardId,
          query_key: queryKey,
          item_id: sale.itemId,
          title: sale.title || null,
          price: sale.price,
          currency: sale.currency,
          sold_at: sale.soldAt,
          grader: sale.grader,
          grade: sale.grade,
          url: sale.url || null,
          fetched_at: fetchedAt,
        }))
      : [
          {
            card_id: cardId,
            query_key: queryKey,
            item_id: "__empty__",
            title: null,
            price: 0,
            currency: null,
            sold_at: fetchedAt,
            grader: null,
            grade: null,
            url: null,
            fetched_at: fetchedAt,
          },
        ];

  const { error } = await client.from("sold_comps_cache").insert(rows);
  if (error) {
    console.warn("[sold_comps_cache] write failed:", error.message);
    return null;
  }
  return fetchedAt;
}
