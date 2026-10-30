import type { ChartPoint } from "@/components/charts/value-chart";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

export type SnapshotRow = { snapshot_date: string; value: number };

/**
 * One point per saved day. Today's live value replaces today's snapshot once
 * it has loaded, so the chart ends on the number in the header.
 */
export function collectionPoints(
  rows: SnapshotRow[],
  { today, live, markers }: { today: string; live: number | null; markers?: Map<string, string> },
): ChartPoint[] {
  const byDate = new Map(rows.map((row) => [row.snapshot_date, row.value]));
  if (live != null) byDate.set(today, live);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value, marker: markers?.get(date) ?? null }));
}

function gradeText(grade: string): string {
  const text = grade.trim();
  return /^raw$/i.test(text) ? "" : text;
}

/** "+ Jordan Love PSA 10" on the day a card was added, or "+ Jordan Love and 2 more". */
export function addedMarkers(
  cards: { playerName: string; grade: string; createdAt: string }[],
): Map<string, string> {
  const byDay = new Map<string, string[]>();
  const sorted = [...cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of sorted) {
    const stamp = new Date(item.createdAt);
    if (Number.isNaN(stamp.getTime())) continue;
    const day = snapshotDateInNewYork(stamp);
    const name = [item.playerName.trim(), gradeText(item.grade)].filter(Boolean).join(" ");
    const list = byDay.get(day) ?? [];
    list.push(name || "a card");
    byDay.set(day, list);
  }
  const out = new Map<string, string>();
  for (const [day, names] of byDay) {
    out.set(day, names.length === 1 ? `+ ${names[0]}` : `+ ${names[0]} and ${names.length - 1} more`);
  }
  return out;
}

/** What the stat grid and Top movers need from a card. */
export type MoverCard = {
  id: string;
  playerName: string;
  paid: number | null;
  value: number | null;
  sold: boolean;
};

export type BestCard<T extends MoverCard> = { card: T; gain: number; pct: number };

/** Held card with the biggest gain over what was paid. */
export function bestCard<T extends MoverCard>(cards: T[]): BestCard<T> | null {
  let best: BestCard<T> | null = null;
  for (const item of cards) {
    if (item.sold || item.paid == null || item.paid <= 0 || item.value == null) continue;
    const gain = item.value - item.paid;
    if (!best || gain > best.gain) best = { card: item, gain, pct: (gain / item.paid) * 100 };
  }
  return best;
}

export type MoverRow<T extends MoverCard> = {
  card: T;
  pct: number;
  /** Sparkline. Empty when only the paid price is known. */
  points: { date: string; value: number }[];
};

export type Movers<T extends MoverCard> = { basis: "history" | "paid"; rows: MoverRow<T>[] };

/**
 * The three biggest moves, up or down. Uses saved daily values when any card
 * has two, and falls back to the gain since the price paid.
 */
export function topMovers<T extends MoverCard>(
  cards: T[],
  history: Map<string, { date: string; value: number }[]>,
  limit = 3,
): Movers<T> {
  const held = cards.filter((item) => !item.sold);
  const fromHistory: MoverRow<T>[] = [];
  for (const item of held) {
    const points = history.get(item.id) ?? [];
    if (points.length < 2) continue;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (!(first > 0)) continue;
    fromHistory.push({ card: item, pct: ((last - first) / first) * 100, points });
  }
  if (fromHistory.length) {
    return {
      basis: "history",
      rows: fromHistory.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, limit),
    };
  }
  const fromPaid: MoverRow<T>[] = [];
  for (const item of held) {
    if (item.paid == null || item.paid <= 0 || item.value == null) continue;
    fromPaid.push({ card: item, pct: ((item.value - item.paid) / item.paid) * 100, points: [] });
  }
  return { basis: "paid", rows: fromPaid.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, limit) };
}
