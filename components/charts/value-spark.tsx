import { toDayMs, xScale, yScale } from "@/lib/chart/geometry";
import { areaPath, downsample, monotonePath } from "@/lib/chart/path";
import { valueScale } from "@/lib/chart/scale";
import { FILL_STOPS, TONE_CLASS, type ChartTone } from "@/lib/chart/theme";

/** One value on one day. `marker` names what happened that day ("+ Jordan Love PSA 10"). */
export type ChartPoint = { date: string; value: number; marker?: string | null };

export { TONE_CLASS, type ChartTone };

const SPARK_W = 100;

/** Spark paths in a 100-wide box and the end point. Empty below two points. */
export function sparkPaths(
  points: ChartPoint[],
  height: number,
  minSpan?: number,
): { line: string; area: string; end: { x: number; y: number } | null } {
  const series = downsample(
    points.map((point) => ({ ...point, t: toDayMs(point.date) })),
    48,
  );
  if (series.length < 2) return { line: "", area: "", end: null };
  const scale = valueScale(
    series.map((point) => point.value),
    { minSpan },
  );
  const x = xScale(series[0].t, series[series.length - 1].t, 1, SPARK_W - 1);
  const y = yScale(scale.domain, 2, height - 2);
  const xy = series.map((point) => ({ x: x(point.t), y: y(point.value) }));
  const line = monotonePath(xy);
  return { line, area: areaPath(line, xy[0].x, xy[xy.length - 1].x, height), end: xy[xy.length - 1] };
}

export function FillStops() {
  return FILL_STOPS.map((stop) => (
    <stop key={stop.offset} offset={`${stop.offset * 100}%`} stopColor="currentColor" stopOpacity={stop.opacity} />
  ));
}

/** The small <ValueChart>: no axes, no scrub, an end dot. No hooks, so it server-renders. */
export function ValueSpark({
  id,
  points,
  tone,
  ariaLabel,
  height = 32,
  minSpan,
  className = "",
}: {
  /** Unique per page, for the gradient. */
  id: string;
  points: ChartPoint[];
  tone: ChartTone;
  ariaLabel: string;
  height?: number;
  minSpan?: number;
  className?: string;
}) {
  const { line, area, end } = sparkPaths(points, height, minSpan);
  if (!line || !end) {
    return <span role="img" aria-label={ariaLabel} className={`block ${className}`} style={{ height }} />;
  }
  const fill = `spark-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${SPARK_W} ${height}`}
      preserveAspectRatio="none"
      className={`block w-full overflow-visible ${TONE_CLASS[tone]} ${className}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <FillStops />
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
      {/* Zero-length round cap: round in a stretched box. */}
      <path
        data-spark-end=""
        d={`M${Math.round(end.x * 10) / 10} ${Math.round(end.y * 10) / 10}h0`}
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
