export type HistoryRangeId = "7d" | "30d" | "all";

export const HISTORY_RANGES: {
  id: HistoryRangeId;
  label: string;
  days: number | null;
  phrase: string;
}[] = [
  { id: "7d", label: "7D", days: 7, phrase: "this week" },
  { id: "30d", label: "30D", days: 30, phrase: "this month" },
  { id: "all", label: "All", days: null, phrase: "all time" },
];

export const HISTORY_RANGE_DISABLED = "Not enough history yet";

export function distinctHistoryDays(dates: string[]): number {
  return new Set(dates.filter(Boolean)).size;
}

/**
 * 7D stays on once two days exist and shows the whole series when history is shorter.
 * A longer range turns on only after history outgrows the previous window,
 * so two ranges never share one badge.
 */
export function isHistoryRangeEnabled(
  range: HistoryRangeId,
  distinctDays: number,
): boolean {
  if (distinctDays < 2) return false;
  if (range === "7d") return true;
  if (range === "30d") return distinctDays > 7;
  return distinctDays > 30;
}

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

export function formatTrackingSince(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const month = MONTHS[(m || 0) - 1];
  if (!y || !month || !d) return "Tracking since —";
  return `Tracking since ${month} ${d}`;
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + delta));
  return dt.toISOString().slice(0, 10);
}

export function pointsInHistoryRange<T extends { date: string }>(
  points: T[],
  range: HistoryRangeId,
  today: string,
): T[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const days = HISTORY_RANGES.find((item) => item.id === range)?.days;
  if (days == null) return sorted;
  const distinct = distinctHistoryDays(sorted.map((point) => point.date));
  if (distinct <= days) return sorted;
  const start = addDaysToYmd(today, -(days - 1));
  return sorted.filter((point) => point.date >= start);
}

export function historyBadge(
  points: { date: string; value: number }[],
  range: HistoryRangeId,
  today: string,
): { delta: number; pct: number | null } | null {
  const series = pointsInHistoryRange(points, range, today);
  if (series.length < 2) return null;
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const delta = last - first;
  const pct = first === 0 ? null : Math.round((delta / Math.abs(first)) * 100);
  return { delta, pct };
}

/** $350, $1.2K, $10K. */
export function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${trimCompact(abs / 1_000_000)}M`;
  if (abs >= 1000) return `${sign}$${trimCompact(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function trimCompact(n: number): string {
  if (n >= 10) return String(Math.round(n));
  return n.toFixed(1).replace(/\.0$/, "");
}

/** Pad around the data. Leave 0 out when the series sits well above it. */
export function valueAxisDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.08, 1) : span * 0.15;
  let low = min - pad;
  let high = max + pad;
  if (min >= 0 && low < 0) low = 0;
  if (high <= low) high = low + 1;
  return [low, high];
}
