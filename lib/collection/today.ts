import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

export type CollectionChange = {
  latestDate: string;
  previousDate: string;
  latest: number;
  previous: number;
  delta: number;
};

/** Latest snapshot minus the previous distinct day. Null when fewer than 2 days. */
export function collectionDayChange(
  rows: { date: string; value: number }[],
): CollectionChange | null {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!row.date) continue;
    byDate.set(row.date, Number(row.value) || 0);
  }
  const dates = [...byDate.keys()].sort();
  if (dates.length < 2) return null;
  const latestDate = dates[dates.length - 1]!;
  const previousDate = dates[dates.length - 2]!;
  const latest = byDate.get(latestDate) ?? 0;
  const previous = byDate.get(previousDate) ?? 0;
  return { latestDate, previousDate, latest, previous, delta: latest - previous };
}

export function hasValuedMedians(
  medians: Array<number | null | undefined>,
): boolean {
  return medians.some((value) => value != null && Number.isFinite(value));
}

export function shouldShowCollectionToday(
  snapshotDayCount: number,
  valued: boolean,
): boolean {
  return snapshotDayCount >= 2 && valued;
}

export type CollectionMover = {
  cardId: string;
  delta: number;
};

/** Top 3 gainers and losers by dollar change between two snapshot dates. */
export function topCollectionMovers(
  rows: { cardId: string; date: string; median: number | null }[],
  latestDate: string,
  previousDate: string,
): { gainers: CollectionMover[]; losers: CollectionMover[] } {
  const byCard = new Map<string, { latest?: number | null; previous?: number | null }>();
  for (const row of rows) {
    const slot = byCard.get(row.cardId) ?? {};
    if (row.date === latestDate) slot.latest = row.median;
    if (row.date === previousDate) slot.previous = row.median;
    byCard.set(row.cardId, slot);
  }

  const deltas: CollectionMover[] = [];
  for (const [cardId, slot] of byCard) {
    if (slot.latest == null || slot.previous == null) continue;
    if (!Number.isFinite(slot.latest) || !Number.isFinite(slot.previous)) continue;
    const delta = slot.latest - slot.previous;
    if (delta === 0) continue;
    deltas.push({ cardId, delta });
  }

  const gainers = deltas
    .filter((row) => row.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.cardId.localeCompare(b.cardId))
    .slice(0, 3);
  const losers = deltas
    .filter((row) => row.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.cardId.localeCompare(b.cardId))
    .slice(0, 3);
  return { gainers, losers };
}

/** localStorage key for dismissing "Your collection today" for the New York date. */
export function collectionTodayDismissKey(now: Date = new Date()): string {
  return `slabhold.collection-today.dismissed.${snapshotDateInNewYork(now)}`;
}
