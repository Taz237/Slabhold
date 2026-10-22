import { sharedCompValue } from "@/lib/comps/shared-value";
import type { CleanedSale, SoldCompCard } from "@/lib/comps/types";
import type { CardValueSale } from "@/lib/value/types";

/** A cent. Anything smaller is not a price. */
export const MIN_SALE_PRICE = 0.01;

/** A fallback sale still carrying its item id, so flags and dedupe can see it. */
export type FallbackSale = CardValueSale & { itemId?: string | null };

/** One sold_comps_cache row. Only the newest fetched_at batch is used. */
export type CachedCompRow = {
  item_id?: string | null;
  title?: string | null;
  price?: number | string | null;
  currency?: string | null;
  sold_at?: string | null;
  grader?: string | null;
  grade?: string | null;
  url?: string | null;
  fetched_at?: string | null;
};

/** Rows from the latest fetch. Older batches and the empty marker are dropped. */
export function newestBatchRows<T extends { fetched_at?: string | null; item_id?: string | null }>(
  rows: readonly T[],
): T[] {
  let newest = "";
  for (const row of rows) {
    const fetched = row.fetched_at ?? "";
    if (fetched > newest) newest = fetched;
  }
  if (!newest) return [];
  return rows.filter((row) => row.fetched_at === newest && row.item_id !== "__empty__");
}

export function cleanedFromCacheRows(rows: readonly CachedCompRow[]): CleanedSale[] {
  const sales: CleanedSale[] = [];
  for (const row of newestBatchRows(rows)) {
    const itemId = (row.item_id ?? "").trim();
    if (!itemId || itemId === "__empty__") continue;
    const price = typeof row.price === "number" ? row.price : Number(row.price);
    if (!Number.isFinite(price) || price < MIN_SALE_PRICE) continue;
    sales.push({
      itemId,
      title: (row.title ?? "").trim(),
      price,
      currency: row.currency ?? null,
      soldAt: row.sold_at ?? row.fetched_at ?? "",
      grader: row.grader ?? null,
      grade: row.grade ?? null,
      url: row.url ?? "",
    });
  }
  return sales;
}

/**
 * Fallback sales for one card.
 * The newest batch goes through the same filter as the estimate, then the
 * owner's flagged item ids are removed.
 */
export function fallbackSales(
  card: SoldCompCard,
  rows: readonly CachedCompRow[],
  flaggedItemIds: ReadonlySet<string>,
): FallbackSale[] {
  const matched = sharedCompValue(card, cleanedFromCacheRows(rows)).sales;
  return matched
    .filter(
      (sale) =>
        sale.itemId &&
        !flaggedItemIds.has(sale.itemId) &&
        sale.price >= MIN_SALE_PRICE,
    )
    .map((sale) => ({ itemId: sale.itemId, price: sale.price, soldAt: sale.soldAt }));
}

/**
 * One exact-sale list. The subject owner's flags apply to every batch,
 * including an identical public copy. Dedupe by item id, and by price plus
 * day only when the sale has no id. The id is dropped after that.
 */
export function mergeExactSales(
  subjectFlaggedItemIds: ReadonlySet<string>,
  groups: readonly (readonly FallbackSale[])[],
): CardValueSale[] {
  const seen = new Set<string>();
  const out: CardValueSale[] = [];
  for (const group of groups) {
    for (const sale of group) {
      const itemId = (sale.itemId ?? "").trim();
      if (itemId && subjectFlaggedItemIds.has(itemId)) continue;
      if (!Number.isFinite(sale.price) || sale.price < MIN_SALE_PRICE) continue;
      const day = (sale.soldAt ?? "").slice(0, 10);
      const key = itemId ? `item:${itemId}` : `price:${sale.price}|${day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ price: sale.price, soldAt: sale.soldAt ?? null });
    }
  }
  return out;
}
