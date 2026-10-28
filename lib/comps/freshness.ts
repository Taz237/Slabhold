import { formatRelativeTime } from "@/lib/relative-time";
import { saleDayLabel } from "@/lib/value/price-fallback";

/**
 * "Newest sale Sep 30 · checked 7 hours ago" for the sold list header.
 * fetchedAt is when we last checked Trawl, not when a card sold, so the two read apart.
 * Either part drops when it has no real date. Empty when neither does.
 */
export function soldFreshnessLabel(
  comps: readonly { soldDate?: string | null }[],
  fetchedAt: string | null | undefined,
  now: number = Date.now(),
): string {
  let newest: string | null = null;
  for (const comp of comps) {
    const day = (comp.soldDate ?? "").slice(0, 10);
    if (!saleDayLabel(day)) continue;
    if (newest == null || day > newest) newest = day;
  }
  const checkedAt = fetchedAt ? new Date(fetchedAt).getTime() : NaN;
  return [
    newest ? `Newest sale ${saleDayLabel(newest)}` : null,
    Number.isNaN(checkedAt) ? null : `checked ${formatRelativeTime(fetchedAt, now)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
