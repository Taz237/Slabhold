import type { ChangeTone } from "@/lib/chart/range";

/**
 * The one chart theme. Every chart color lives here: the tones, the hex for
 * Satori (share images), and the class names for the grid, band and tooltip
 * (their colors are CSS variables in the chart block of app/globals.css).
 */

export type ChartTone = "up" | "down" | "flat" | "brand" | "accent";

/** Line color. Each passes 3:1 on white and on #18181B. */
export const TONE_CLASS: Record<ChartTone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  /** Exactly no change: neutral, never green. */
  flat: "text-zinc-500 dark:text-zinc-400",
  /** No direction yet (few sales, sample data), or a calm week. */
  brand: "text-violet-600 dark:text-violet-400",
  /** Light purple on an always-dark panel (landing). */
  accent: "text-[#A78BFA]",
};

/** Satori has no classes: the dark-theme tone colors, as on the share image. */
export const TONE_HEX: Record<Exclude<ChartTone, "accent">, string> = {
  up: "#34D399",
  down: "#FB7185",
  flat: "#A1A1AA",
  brand: "#A78BFA",
};

/** Slabhold purple: violet-600 on light, the light accent on dark, the deep shade. */
export const BRAND = { light: "#7C3AED", dark: "#A78BFA", deep: "#5B21B6" } as const;

/** Area fill under every line: tone at 26%, 10% at 60% down, then nothing. */
export const FILL_STOPS: readonly { offset: number; opacity: number }[] = [
  { offset: 0, opacity: 0.26 },
  { offset: 0.6, opacity: 0.1 },
  { offset: 1, opacity: 0 },
];

/** Hairline grid, 6% on light, 7% on dark. */
export const CHART_GRID = "chart-grid";
/** Axis labels: zinc-500 on light, zinc-400 on dark (4.5:1 on the surface). */
export const CHART_TICK = "chart-tick text-[10.5px] tabular-nums";
/** The line's starting value, zinc at 10%. */
export const CHART_BASELINE = "chart-baseline";
/** The middle half of sales: purple at 8% (light) or 12% (dark). */
export const CHART_BAND = "chart-band";
/** The median inside the band: purple at 50%. */
export const CHART_MEDIAN = "chart-median";
/** The median's label pill. */
export const CHART_MEDIAN_PILL = "chart-median-pill";
/** The scrub tooltip: zinc-900/95 on dark, white on light, a purple hairline. */
export const CHART_TIP =
  "chart-tip pointer-events-none absolute top-0 left-0 flex h-[22px] items-center justify-center rounded-full text-xs whitespace-nowrap tabular-nums";

/** The collection hero's tone: the range tone, or calm purple for a move under 0.5%. */
export type HeroTone = ChangeTone | "calm";

/** Under this, a move reads as steady, in the brand color, never as a loss. */
export const CALM_PCT = 0.5;

/**
 * Gray for exactly $0, calm purple when the range moved less than 0.5% either
 * way, else green or red. The sign stays in the text either way.
 */
export function heroTone(change: { delta: number; pct: number | null } | null | undefined): HeroTone {
  if (!change || change.delta === 0) return "flat";
  if (change.pct != null && Math.abs(change.pct) < CALM_PCT) return "calm";
  return change.delta > 0 ? "up" : "down";
}

/** The line tone for a hero tone. Calm draws in brand purple. */
export function heroLineTone(tone: HeroTone): ChartTone {
  return tone === "calm" ? "brand" : tone;
}

/** Change pills: green up, red down, purple calm, gray for exactly no change. */
export const PILL_TONE: Record<HeroTone, string> = {
  up: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  down: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  flat: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  calm: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

/**
 * The y span a collection chart (or a card's spark) never goes below, so a
 * 19-cent week is a near-flat line, not a crash: 4% of the latest value, at
 * least $5.
 */
export function collectionMinSpan(latest: number): number {
  return Math.max(Math.abs(latest) * 0.04, 5);
}
