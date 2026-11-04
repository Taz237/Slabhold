import type { ChangeTone } from "@/lib/chart/range";

/** The one chart theme: every chart color lives here (class colors are variables in app/globals.css). */

export type ChartTone = "up" | "down" | "flat" | "brand" | "accent";

/** Line color. Each passes 3:1 on white and on #18181B. */
export const TONE_CLASS: Record<ChartTone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  flat: "text-zinc-500 dark:text-zinc-400",
  brand: "text-violet-600 dark:text-violet-400",
  accent: "text-[#A78BFA]",
};

/** For Satori: the dark tone colors. */
export const TONE_HEX: Record<Exclude<ChartTone, "accent">, string> = {
  up: "#34D399",
  down: "#FB7185",
  flat: "#A1A1AA",
  brand: "#A78BFA",
};

/** Area fill: 26%, 10% at 60%, then 0. */
export const FILL_STOPS: readonly { offset: number; opacity: number }[] = [
  { offset: 0, opacity: 0.26 },
  { offset: 0.6, opacity: 0.1 },
  { offset: 1, opacity: 0 },
];

/** Grid, ticks, baseline, band, median and tooltip; colors on .chart-surface. */
export const CHART = {
  grid: "chart-grid",
  tick: "chart-tick text-[10.5px] tabular-nums",
  baseline: "chart-baseline",
  band: "chart-band",
  median: "chart-median",
  pill: "chart-median-pill",
  tip: "chart-tip pointer-events-none absolute top-0 left-0 flex h-[22px] items-center justify-center rounded-full text-xs whitespace-nowrap tabular-nums",
};

export type HeroTone = ChangeTone | "calm";

/** Gray at exactly $0, calm purple under 0.5% either way, else green or red. */
export function heroTone(change: { delta: number; pct: number | null } | null | undefined): HeroTone {
  if (!change || change.delta === 0) return "flat";
  if (change.pct != null && Math.abs(change.pct) < 0.5) return "calm";
  return change.delta > 0 ? "up" : "down";
}

export function heroLineTone(tone: HeroTone): ChartTone {
  return tone === "calm" ? "brand" : tone;
}

/** Change pills. */
export const PILL_TONE: Record<HeroTone, string> = {
  up: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  down: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  flat: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  calm: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

/** Smallest y span for collection charts: 4% of the value, $5 at least. */
export function collectionMinSpan(latest: number): number {
  return Math.max(Math.abs(latest) * 0.04, 5);
}
