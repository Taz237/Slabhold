import { shouldRefreshCardValueOnEdit, type PriceRefreshCard } from "@/lib/value/price-refresh";

export type SnapshotChangeCard = PriceRefreshCard & {
  isPublic?: boolean;
  sellPrice?: number | null;
  sellDate?: string | null;
};

function sold(card: SnapshotChangeCard): boolean {
  return card.sellPrice != null && card.sellDate != null;
}

/**
 * True when the edit can freeze a stale value: a sale, a visibility change,
 * or any field that changes the comps query.
 */
export function cardChangeNeedsSnapshot(
  before: SnapshotChangeCard,
  after: SnapshotChangeCard,
): boolean {
  if (Boolean(before.isPublic) !== Boolean(after.isPublic)) return true;
  if (sold(after) && !sold(before)) return true;
  return shouldRefreshCardValueOnEdit(before, after);
}
