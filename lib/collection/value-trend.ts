import { addDaysToYmd } from "@/lib/collection/chart-range";

/** Caption under collection totals. Values come from stored sold-price snapshots. */
export const ESTIMATED_VALUE_LABEL = "Est. from recent sold prices";

export type TrendRange = "7d" | "30d" | "all";

export type TrendSnapshot = {
  date: string;
  value: number;
};

export const TREND_RANGES: { id: TrendRange; label: string; phrase: string }[] = [
  { id: "7d", label: "7D", phrase: "in 7 days" },
  { id: "30d", label: "30D", phrase: "in 30 days" },
  { id: "all", label: "All", phrase: "all time" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Owner-only. collection_snapshots are readable by the signed-in owner.
 * A private collection is never shown to a visitor. A public flag does not
 * hand the series to anyone else, because this screen has no public read.
 */
export function canShowCollectionTrend(input: {
  viewerId: string | null;
  ownerId: string | null;
  collectionPublic: boolean;
}): boolean {
  if (input.viewerId == null || input.ownerId == null) return false;
  if (input.viewerId !== input.ownerId) {
    if (input.collectionPublic) return false;
    return false;
  }
  return true;
}

export function trackingStartedLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const month = MONTHS[(m || 0) - 1];
  if (!y || !month || !d) return "Tracking started";
  return `Tracking started ${month} ${d}`;
}

export function normalizeTrendSnapshots(points: TrendSnapshot[]): TrendSnapshot[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date)) continue;
    const value = Number(point.value);
    byDate.set(point.date, Number.isFinite(value) ? value : 0);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function pointsInTrendRange(
  points: TrendSnapshot[],
  range: TrendRange,
  today: string,
): TrendSnapshot[] {
  const sorted = normalizeTrendSnapshots(points);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : null;
  if (days == null) return sorted;
  const start = addDaysToYmd(today, -(days - 1));
  return sorted.filter((point) => point.date >= start);
}

export function formatTrendDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "$0";
  const sign = delta > 0 ? "+" : delta < 0 ? "\u2212" : "";
  return `${sign}${formatAbsDollars(delta)}`;
}

function formatAbsDollars(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const dollars = Math.trunc(cents / 100);
  const rem = cents % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (rem === 0) return `$${grouped}`;
  return `$${grouped}.${String(rem).padStart(2, "0")}`;
}

function oneDecimal(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Math.abs(rounded).toFixed(1);
}

export function trendPhrase(range: TrendRange): string {
  return TREND_RANGES.find((item) => item.id === range)?.phrase ?? "in 7 days";
}

/**
 * Change from the first snapshot in the range to the last.
 * A zero starting value with a real move omits the percent (no divide-by-zero).
 * A zero-to-zero move is 0.0%.
 */
export function trendChange(
  points: TrendSnapshot[],
  range: TrendRange,
): { delta: number; percent: number | null; label: string } | null {
  const series = normalizeTrendSnapshots(points);
  if (series.length < 2) return null;
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const delta = last - first;
  const phrase = trendPhrase(range);
  const moneyPart = formatTrendDelta(delta);
  if (first === 0) {
    if (delta === 0) return { delta, percent: 0, label: `${moneyPart} (0.0%) ${phrase}` };
    return { delta, percent: null, label: `${moneyPart} ${phrase}` };
  }
  const percent = (delta / Math.abs(first)) * 100;
  return {
    delta,
    percent,
    label: `${moneyPart} (${oneDecimal(percent)}%) ${phrase}`,
  };
}

export type CollectionTrendView =
  | { kind: "tracking"; label: string | null }
  | { kind: "trend"; label: string | null; points: TrendSnapshot[]; delta: number | null };

export function describeCollectionTrend(
  points: TrendSnapshot[],
  range: TrendRange,
  today: string,
): CollectionTrendView {
  const series = normalizeTrendSnapshots(points);
  if (series.length < 2) {
    const date = series[0]?.date ?? null;
    return { kind: "tracking", label: date ? trackingStartedLabel(date) : null };
  }
  const filtered = pointsInTrendRange(series, range, today);
  const change = filtered.length >= 2 ? trendChange(filtered, range) : null;
  return {
    kind: "trend",
    label: change?.label ?? null,
    points: filtered.length >= 2 ? filtered : [],
    delta: change?.delta ?? null,
  };
}

export function collectionTrendView(input: {
  viewerId: string | null;
  ownerId: string | null;
  collectionPublic: boolean;
  snapshots: TrendSnapshot[];
  range: TrendRange;
  today: string;
}): CollectionTrendView | null {
  if (
    !canShowCollectionTrend({
      viewerId: input.viewerId,
      ownerId: input.ownerId,
      collectionPublic: input.collectionPublic,
    })
  ) {
    return null;
  }
  return describeCollectionTrend(input.snapshots, input.range, input.today);
}
