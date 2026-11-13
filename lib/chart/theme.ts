import type { ChangeTone } from "@/lib/chart/range";

/** The one chart theme: every chart color lives here (class colors are variables in app/globals.css). */

export type ChartTone = "up" | "down" | "flat" | "brand" | "accent";

/**
 * Line color. Up is brand purple, down and flat are gray: never green or red.
 * The chip beside a chart (▲ or ▼) and the dashed baseline under a falling
 * line carry the direction, never the color alone. Each passes 3:1 on white
 * and on #18181B.
 */
export const TONE_CLASS: Record<ChartTone, string> = {
  up: "text-violet-600 dark:text-violet-400",
  down: "text-zinc-500 dark:text-zinc-400",
  flat: "text-zinc-500 dark:text-zinc-400",
  brand: "text-violet-600 dark:text-violet-400",
  accent: "text-[#A78BFA]",
};

/** For Satori (share images, always dark): purple up, gray down. The +/− sign carries direction. */
export const TONE_HEX: Record<Exclude<ChartTone, "accent">, string> = {
  up: "#A78BFA",
  down: "#A1A1AA",
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
  tick: "chart-tick text-[0.6562rem] tabular-nums",
  baseline: "chart-baseline",
  band: "chart-band",
  median: "chart-median",
  pill: "chart-median-pill",
  tip: "chart-tip pointer-events-none absolute top-0 left-0 flex h-[22px] items-center justify-center rounded-full text-xs whitespace-nowrap tabular-nums",
};

export type HeroTone = ChangeTone | "calm";

/** Gray at exactly $0, calm purple under 0.5% either way, else up or down. */
export function heroTone(change: { delta: number; pct: number | null } | null | undefined): HeroTone {
  if (!change || change.delta === 0) return "flat";
  if (change.pct != null && Math.abs(change.pct) < 0.5) return "calm";
  return change.delta > 0 ? "up" : "down";
}

export function heroLineTone(tone: HeroTone): ChartTone {
  return tone === "calm" ? "brand" : tone;
}

/**
 * Market-move pills, matching the collection chart: a lighter purple with ▲
 * when up, muted gray with ▼ when down, gray with no arrow when flat. Never
 * green or red. The arrow, the sign and a screen-reader word carry the
 * direction, never the color alone. Text passes 4.5:1 on its tint in both themes.
 */
export const MOVE_PILL: Record<ChangeTone, string> = {
  up: "bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  down: "bg-zinc-500/12 text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-400",
  flat: "bg-zinc-500/12 text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-400",
};

/** Change pills, the same as MOVE_PILL. "calm" (under 0.5% either way) is a quieter purple. */
export const PILL_TONE: Record<HeroTone, string> = {
  ...MOVE_PILL,
  calm: "bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
};

/** A change as plain text (a percent in a list): MOVE_PILL's colors with no tint. 4.5:1 in both themes. */
export const MOVE_TEXT: Record<ChangeTone, string> = {
  up: "text-violet-700 dark:text-violet-300",
  down: "text-zinc-600 dark:text-zinc-400",
  flat: "text-zinc-600 dark:text-zinc-400",
};

/** The arrow for a change, for text that can't hold a component. Flat has none. */
export function moveArrow(tone: ChangeTone): string {
  return tone === "up" ? "▲" : tone === "down" ? "▼" : "";
}

/** Smallest y span for collection charts: 4% of the value, $5 at least. */
export function collectionMinSpan(latest: number): number {
  return Math.max(Math.abs(latest) * 0.04, 5);
}
