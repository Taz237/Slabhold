import { toDayMs, xScale, yScale } from "@/lib/chart/geometry";
import { areaPath, downsample, monotonePath } from "@/lib/chart/path";
import { valueScale } from "@/lib/chart/scale";

/** One value on one day. `marker` names what happened that day ("+ Jordan Love PSA 10"). */
export type ChartPoint = { date: string; value: number; marker?: string | null };

export type ChartTone = "up" | "down" | "flat" | "brand" | "accent";

/** Line color. Each passes 3:1 on white and on #18181B. */
export const TONE_CLASS: Record<ChartTone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  /** Exactly no change: neutral, never green. */
  flat: "text-zinc-500 dark:text-zinc-400",
  brand: "text-violet-600 dark:text-violet-400",
  /** Light purple on an always-dark panel (landing). */
  accent: "text-[#A78BFA]",
};

const SPARK_W = 100;

/** Sparkline paths in a 100-wide box. Empty below two points. */
export function sparkPaths(points: ChartPoint[], height: number): { line: string; area: string } {
  const series = downsample(
    points.map((point) => ({ ...point, t: toDayMs(point.date) })),
    48,
  );
  if (series.length < 2) return { line: "", area: "" };
  const scale = valueScale(series.map((point) => point.value));
  const x = xScale(series[0].t, series[series.length - 1].t, 1, SPARK_W - 1);
  const y = yScale(scale.domain, 2, height - 2);
  const xy = series.map((point) => ({ x: x(point.t), y: y(point.value) }));
  const line = monotonePath(xy);
  return { line, area: areaPath(line, xy[0].x, xy[xy.length - 1].x, height) };
}

/**
 * The small form of <ValueChart>: same curve, same scale and tones, no axes and
 * no scrub. No hooks, so a server-rendered page can draw it without chart JS.
 */
export function ValueSpark({
  id,
  points,
  tone,
  ariaLabel,
  height = 32,
  className = "",
}: {
  /** Unique per page, for the gradient. */
  id: string;
  points: ChartPoint[];
  tone: ChartTone;
  ariaLabel: string;
  height?: number;
  className?: string;
}) {
  const { line, area } = sparkPaths(points, height);
  if (!line) {
    return <span role="img" aria-label={ariaLabel} className={`block ${className}`} style={{ height }} />;
  }
  const fill = `spark-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${SPARK_W} ${height}`}
      preserveAspectRatio="none"
      className={`block w-full ${TONE_CLASS[tone]} ${className}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fill})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
