import { money, signedMoney } from "@/lib/format";

export type RangeId = "7d" | "30d" | "90d" | "1y" | "all";

export const RANGES: { id: RangeId; label: string; days: number | null; phrase: string }[] = [
  { id: "7d", label: "7D", days: 7, phrase: "past 7 days" },
  { id: "30d", label: "30D", days: 30, phrase: "past 30 days" },
  { id: "90d", label: "90D", days: 90, phrase: "past 90 days" },
  { id: "1y", label: "1Y", days: 365, phrase: "past year" },
  { id: "all", label: "All", days: null, phrase: "all time" },
];

const RANGE_IDS = new Set<string>(RANGES.map((range) => range.id));

export type DatedValue = { date: string; value: number };

export function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + delta)).toISOString().slice(0, 10);
}

/** First day inside a fixed range ending today. Null for All. */
export function rangeStart(range: RangeId, today: string): string | null {
  const days = RANGES.find((item) => item.id === range)?.days;
  return days == null ? null : addDays(today, -(days - 1));
}

/**
 * Ranges worth a button. A fixed range shows once history reaches past its
 * window, so it never shows the same line as All. Nothing below two points.
 */
export function availableRanges(points: { date: string }[], today: string): RangeId[] {
  if (points.length < 2) return [];
  const earliest = points.reduce((min, point) => (point.date < min ? point.date : min), points[0].date);
  return RANGES.filter((range) => {
    const start = rangeStart(range.id, today);
    return start == null || earliest < start;
  }).map((range) => range.id);
}

/**
 * Points inside the range. The last value before the window is carried to
 * the window's first day, so the change covers the whole range.
 */
export function pointsInRange<T extends DatedValue>(points: T[], range: RangeId, today: string): T[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const start = rangeStart(range, today);
  if (start == null) return sorted;
  const inside = sorted.filter((point) => point.date >= start);
  const before = sorted.filter((point) => point.date < start).pop();
  if (before && inside[0]?.date !== start) return [{ ...before, date: start }, ...inside];
  return inside;
}

export type RangeChange = { delta: number; pct: number | null; up: boolean };

/** First to last of one range. `up` drives the color, from the same delta as the text. */
export function rangeChange(points: { value: number }[]): RangeChange | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = Math.round((last - first) * 100) / 100;
  const pct = first === 0 ? null : (delta / Math.abs(first)) * 100;
  return { delta, pct, up: delta >= 0 };
}

/** "+4.2%", "−23.4%", "+595%". */
export function formatPct(pct: number, signed = true): string {
  const abs = Math.abs(pct);
  const text = abs < 100 ? (Math.round(abs * 10 + 1e-9) / 10).toFixed(1) : String(Math.round(abs));
  if (!signed) return `${text}%`;
  return `${pct < 0 ? "−" : "+"}${text}%`;
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "past 30 days", or "since Oct 3" for All. */
export function rangePhrase(range: RangeId, firstDate: string): string {
  if (range === "all") return firstDate ? `since ${shortDate(firstDate)}` : "all time";
  return RANGES.find((item) => item.id === range)?.phrase ?? "";
}

/** "+$244.00 (+595%)" */
export function changeAmount(change: RangeChange): string {
  const amount = change.delta === 0 ? money(0) : signedMoney(change.delta);
  return change.pct == null ? amount : `${amount} (${formatPct(change.pct)})`;
}

/** "+$244.00 (+595%) past 30 days" */
export function changeText(change: RangeChange, range: RangeId, firstDate: string): string {
  return `${changeAmount(change)} ${rangePhrase(range, firstDate)}`;
}

/** Screen-reader line: "Collection value $285.00, up 595% past 30 days". */
export function chartSummary(
  label: string,
  value: number,
  change: RangeChange | null,
  range: RangeId,
  firstDate: string,
): string {
  const head = `${label} ${money(value)}`;
  if (!change) return head;
  const phrase = rangePhrase(range, firstDate);
  if (change.delta === 0) return `${head}, unchanged ${phrase}`;
  const word = change.up ? "up" : "down";
  const amount = change.pct == null ? money(Math.abs(change.delta)) : formatPct(change.pct, false);
  return `${head}, ${word} ${amount} ${phrase}`;
}

const STORAGE_PREFIX = "slabhold:chart-range:";

export function readStoredRange(storage: Storage | null | undefined, chart: string): RangeId | null {
  try {
    const value = storage?.getItem(STORAGE_PREFIX + chart) ?? null;
    return value && RANGE_IDS.has(value) ? (value as RangeId) : null;
  } catch {
    return null;
  }
}

export function writeStoredRange(storage: Storage | null | undefined, chart: string, range: RangeId): void {
  try {
    storage?.setItem(STORAGE_PREFIX + chart, range);
  } catch {
    // Private mode or blocked storage. The choice still holds for this visit.
  }
}

/** The remembered range if it still has data, else 30D, else the longest shown. */
export function pickRange(available: RangeId[], stored: RangeId | null): RangeId {
  if (stored && available.includes(stored)) return stored;
  if (available.includes("30d")) return "30d";
  return available[available.length - 1] ?? "all";
}
