import { money } from "@/lib/format";
import { formatCardValueLabel } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";
import { CACHE_TTL_MS } from "./cache-ttl";
import type { MatchCard } from "./match";
import { sharedCompValue } from "./shared-value";
import type { CleanedSale } from "./types";

export type PreviewCompsBatch = {
  queryKey: string;
  sales: CleanedSale[];
  fetchedAt: string;
};

/**
 * Same freshness + query-key gate the card page uses via readSoldCompsCache.
 * Stale batches and batches for a different key are ignored.
 */
export function selectFreshMatchingCompsSales(input: {
  expectedQueryKey: string;
  batch: PreviewCompsBatch | null;
  nowMs?: number;
  ttlMs?: number;
}): CleanedSale[] | null {
  if (!input.batch || !input.expectedQueryKey) return null;
  if (input.batch.queryKey !== input.expectedQueryKey) return null;
  const fetchedMs = new Date(input.batch.fetchedAt).getTime();
  if (Number.isNaN(fetchedMs)) return null;
  const age = (input.nowMs ?? Date.now()) - fetchedMs;
  const ttl = input.ttlMs ?? CACHE_TTL_MS;
  if (age < 0 || age > ttl) return null;
  return input.batch.sales;
}

/**
 * Share-preview dollar label: price a fresh same-key comps batch the same way
 * the card page does (including owner "Report wrong sale" exclusions). Without a
 * usable batch, use the stored card_values label (/api/card-values).
 */
export function previewValueLabelFromSources(input: {
  card: MatchCard;
  expectedQueryKey: string;
  batch: PreviewCompsBatch | null;
  hiddenItemIds?: ReadonlySet<string>;
  stored: CardValueResult | null | undefined;
  createdAt?: string | null;
  nowMs?: number;
}): string {
  const freshSales = selectFreshMatchingCompsSales({
    expectedQueryKey: input.expectedQueryKey,
    batch: input.batch,
    nowMs: input.nowMs,
  });
  if (freshSales) {
    const visible = input.hiddenItemIds?.size
      ? freshSales.filter((sale) => !input.hiddenItemIds!.has(sale.itemId))
      : freshSales;
    const valued = sharedCompValue(input.card, visible);
    if (valued.median != null && valued.count >= 1) {
      return money(valued.median, true);
    }
  }
  return formatCardValueLabel(input.stored, { createdAt: input.createdAt });
}
