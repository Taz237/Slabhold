import { rangeStart, type RangeId } from "@/lib/chart/range";

/** A trend needs this many sales on the line. */
export const TREND_MIN_SALES = 3;

/** The comp chart's zoom ranges. All is the default and always today's read. */
export const COMP_RANGES: { id: Extract<RangeId, "30d" | "90d" | "all">; label: string; days: number | null; phrase: string }[] = [
  { id: "30d", label: "30D", days: 30, phrase: "past 30 days" },
  { id: "90d", label: "90D", days: 90, phrase: "past 90 days" },
  { id: "all", label: "All", days: null, phrase: "" },
];

export type CompRange = (typeof COMP_RANGES)[number]["id"];

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}

/**
 * Ranges worth a chip: a shorter window shows only when the sales span more
 * than it and at least TREND_MIN_SALES of them fall inside. Empty (no chips)
 * when only All would show, which is most comps (about 30 days of sales).
 */
export function compRanges(sales: { date: string }[], today: string): CompRange[] {
  if (sales.length < TREND_MIN_SALES) return [];
  const dates = sales.map((sale) => sale.date).sort();
  const span = dayCount(dates[0], dates[dates.length - 1]);
  const shorter = COMP_RANGES.filter((range) => {
    if (range.days == null) return false;
    const start = rangeStart(range.id, today) ?? "";
    const inside = dates.filter((date) => date >= start).length;
    return span > range.days && inside >= TREND_MIN_SALES && inside < dates.length;
  }).map((range) => range.id);
  return shorter.length ? [...shorter, "all"] : [];
}

/** The sales inside a comp range. All is every sale. */
export function salesInCompRange<T extends { date: string }>(sales: T[], range: CompRange, today: string): T[] {
  const start = range === "all" ? null : rangeStart(range, today);
  return start == null ? sales : sales.filter((sale) => sale.date >= start);
}

/** "2h ago", "3d ago", "just now". Empty when there is no real time. */
export function shortAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
