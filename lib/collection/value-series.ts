import type { ChartPoint } from "@/components/charts/value-chart";
import { addDays } from "@/lib/chart/range";
import { MIN_BASE } from "@/lib/collection/performance";
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

/** "Added: Jordan Love PSA 10" on the day a card was added, or "Added: Jordan Love and 2 more". */
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
    out.set(day, names.length === 1 ? `Added: ${names[0]}` : `Added: ${names[0]} and ${names.length - 1} more`);
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
  /** When the card was added. Breaks a tie for the top card. */
  createdAt?: string;
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

/**
 * The most valuable held card by its current value, for when no card is up
 * since it was paid for ("Top card", never a loss under "Best card"). The
 * newest card wins a tie. Sold cards and cards with no value are skipped.
 */
export function topCardByValue<T extends MoverCard>(cards: T[]): T | null {
  let top: T | null = null;
  for (const item of cards) {
    if (item.sold || item.value == null || !(item.value > 0)) continue;
    if (
      !top ||
      item.value > (top.value as number) ||
      (item.value === top.value && (item.createdAt ?? "") > (top.createdAt ?? ""))
    ) {
      top = item;
    }
  }
  return top;
}

export type MoverRow<T extends MoverCard> = {
  card: T;
  pct: number;
  /** Bought for under $1: shown as "New", never a % from a penny. `pct` is 0. */
  fresh: boolean;
  /** Sparkline. Empty when only the paid price is known. */
  points: { date: string; value: number }[];
};

/** Market price change over the past 7 days, from saved daily values. */
export const WEEK_DAYS = 7;

/**
 * Biggest movers this week: market price change, up or down, three at most.
 * Never uses what was paid. The base is the last saved value on or before a
 * week ago, else the first value inside the week. A base under $1 is skipped.
 */
export function weekMovers<T extends MoverCard>(
  cards: T[],
  history: Map<string, { date: string; value: number }[]>,
  today: string,
  limit = 3,
): MoverRow<T>[] {
  const start = addDays(today, -WEEK_DAYS);
  const rows: MoverRow<T>[] = [];
  for (const item of cards) {
    if (item.sold) continue;
    const all = history.get(item.id) ?? [];
    let from = 0;
    for (let i = 0; i < all.length; i++) if (all[i].date <= start) from = i;
    const points = all.slice(from).filter((point, i) => i === 0 || point.date > start);
    if (points.length < 2) continue;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (!(first >= MIN_BASE)) continue;
    rows.push({ card: item, pct: ((last - first) / first) * 100, fresh: false, points });
  }
  return rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, limit);
}

/**
 * The gain since the price paid, only for held cards with a paid value and a
 * value. Cards without a paid value never show here, not even as $0.
 */
export function paidMovers<T extends MoverCard>(cards: T[], limit = 3): MoverRow<T>[] {
  const rows: MoverRow<T>[] = [];
  for (const item of cards) {
    if (item.sold || item.paid == null || !(item.paid > 0) || item.value == null) continue;
    const fresh = item.paid < MIN_BASE;
    const pct = fresh ? 0 : ((item.value - item.paid) / item.paid) * 100;
    rows.push({ card: item, pct, fresh, points: [] });
  }
  const rank = (a: MoverRow<T>, b: MoverRow<T>) => Number(a.fresh) - Number(b.fresh) || Math.abs(b.pct) - Math.abs(a.pct);
  return rows.sort(rank).slice(0, limit);
}
