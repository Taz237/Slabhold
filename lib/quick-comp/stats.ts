import type { CompListing } from "@/lib/types";

export type QuickCompStats = { avg: number; high: number; low: number };

/** Avg, high and low of the kept sales. Null when no sale has a real price, never $0. */
export function quickCompStats(comps: readonly Pick<CompListing, "soldPrice">[]): QuickCompStats | null {
  const prices = comps.map((comp) => comp.soldPrice).filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length === 0) return null;
  const sum = prices.reduce((total, price) => total + price, 0);
  return {
    avg: Math.round((sum / prices.length) * 100) / 100,
    high: Math.max(...prices),
    low: Math.min(...prices),
  };
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function day(ymd: string): Date | null {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
}

/** "Sep 4–Oct 30", or one day, with years only when the range crosses one. */
export function saleSpan(dates: readonly string[]): string {
  const days = dates.map(day).filter((value): value is Date => value != null).sort((a, b) => a.getTime() - b.getTime());
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  const crossesYear = first.getUTCFullYear() !== last.getUTCFullYear();
  const format = crossesYear ? MONTH_YEAR : MONTH;
  if (first.getTime() === last.getTime()) return format.format(first);
  return `${format.format(first)}–${format.format(last)}`;
}

/** "14 sales · Sep 4–Oct 30". */
export function trustLine(comps: readonly Pick<CompListing, "soldDate">[]): string {
  const count = comps.length;
  if (count === 0) return "";
  const span = saleSpan(comps.map((comp) => comp.soldDate));
  return [`${count} sale${count === 1 ? "" : "s"}`, span].filter(Boolean).join(" · ");
}
