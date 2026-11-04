import { money, signedMoney } from "@/lib/format";
import { toDayMs, xScale, yScale } from "@/lib/chart/geometry";
import { areaPath, downsample, monotonePath } from "@/lib/chart/path";
import {
  availableRanges,
  changeText,
  changeTone,
  chartReady,
  pickRange,
  pointsInRange,
  rangeChange,
  RANGES,
  type ChangeTone,
  type RangeId,
} from "@/lib/chart/range";
import { valueScale } from "@/lib/chart/scale";
import { collectionMinSpan } from "@/lib/chart/theme";
import type { SnapshotRow } from "@/lib/collection/value-series";

/** Plot box inside the 1080×1350 image. */
export const SHARE_CHART = { width: 952, height: 520 };
/** Room at the right for the latest-value dot (r 10 and its ring). */
const DOT_ROOM = 16;

const RANGE_WORDS: Record<RangeId, string> = {
  "7d": "this week",
  "30d": "this month",
  "90d": "the past 90 days",
  "1y": "this year",
  all: "",
};

export function shareRange(raw: string | null | undefined): RangeId {
  return RANGES.some((range) => range.id === raw) ? (raw as RangeId) : "30d";
}

export function collectionValueImagePath(range: RangeId): string {
  return `/api/share-image/collection-value?range=${range}`;
}

export function collectionValueShareText(): string {
  return "My collection on Slabhold";
}

export type CollectionValueShare = {
  handle: string;
  site: string;
  value: string;
  change: string;
  up: boolean;
  /** Line and chip color. Exactly no change is neutral. */
  tone: ChangeTone;
  headline: string;
  rangeLabel: string;
  line: string;
  area: string;
  /** The latest value's dot. */
  last: { x: number; y: number };
  /** The range's first value, as a hairline. */
  baseY: number;
};

/**
 * The share card: value, the selected range's change, the line, @handle and
 * slabhold.app. Uses the same range math as the chart on screen. Null until
 * the chart on screen would draw (one saved day plus today is not enough).
 */
export function collectionValueShareModel(input: {
  username: string;
  rows: SnapshotRow[];
  range: RangeId;
  today: string;
}): CollectionValueShare | null {
  const handle = input.username.replace(/^@/, "").trim().toLowerCase();
  if (!handle) return null;
  const all = input.rows
    .map((row) => ({ date: row.snapshot_date, value: row.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartReady(all)) return null;
  const available = availableRanges(all, input.today);
  if (!available.length) return null;
  const range = pickRange(available, input.range);
  const points = pointsInRange(all, range, input.today);
  const change = rangeChange(points);
  if (!change) return null;
  const last = points[points.length - 1];

  const series = downsample(points.map((point) => ({ ...point, t: toDayMs(point.date) })), 120);
  // The app's own scale and line: a small move stays small, and the line is smooth, not a cliff.
  const scale = valueScale(
    series.map((point) => point.value),
    { minSpan: collectionMinSpan(last.value) },
  );
  const x = xScale(series[0].t, series[series.length - 1].t, 0, SHARE_CHART.width - DOT_ROOM);
  const y = yScale(scale.domain, 16, SHARE_CHART.height - 8);
  const xy = series.map((point) => ({ x: x(point.t), y: y(point.value) }));
  const line = monotonePath(xy);

  const words = RANGE_WORDS[range];
  const headline =
    change.up && change.delta > 0 && words
      ? `My collection is up ${signedMoney(change.delta).replace(/^\+/, "")} ${words}`
      : words
        ? `My collection ${words}`
        : "My collection";

  return {
    handle: `@${handle}`,
    site: "slabhold.app",
    value: money(last.value),
    change: changeText(change, range, points[0].date),
    up: change.up,
    tone: changeTone(change),
    headline,
    rangeLabel: RANGES.find((item) => item.id === range)?.label ?? "",
    line,
    area: areaPath(line, xy[0].x, xy[xy.length - 1].x, SHARE_CHART.height),
    last: xy[xy.length - 1],
    baseY: xy[0].y,
  };
}
