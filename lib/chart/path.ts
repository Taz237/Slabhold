export type XY = { x: number; y: number };

function r(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

/** Interior tangent (Steffen / d3 monotoneX). Zero at a turn, so nothing overshoots. */
function slope3(p0: XY, p1: XY, p2: XY): number {
  const h0 = p1.x - p0.x;
  const h1 = p2.x - p1.x;
  if (!(h0 > 0) || !(h1 > 0)) return 0;
  const s0 = (p1.y - p0.y) / h0;
  const s1 = (p2.y - p1.y) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

function slope2(p0: XY, p1: XY, t: number): number {
  const h = p1.x - p0.x;
  return h ? (3 * (p1.y - p0.y) / h - t) / 2 : t;
}

/** Monotone cubic through every point: smooth, and never higher or lower than the data. */
export function monotonePath(pts: XY[]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${r(pts[0].x)} ${r(pts[0].y)}`;
  const n = pts.length;
  const tangents = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) tangents[i] = slope3(pts[i - 1], pts[i], pts[i + 1]);
  if (n === 2) {
    const h = pts[1].x - pts[0].x;
    const s = h ? (pts[1].y - pts[0].y) / h : 0;
    tangents[0] = s;
    tangents[1] = s;
  } else {
    tangents[0] = slope2(pts[0], pts[1], tangents[1]);
    tangents[n - 1] = slope2(pts[n - 2], pts[n - 1], tangents[n - 2]);
  }
  let d = `M${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = (b.x - a.x) / 3;
    d += `C${r(a.x + dx)} ${r(a.y + dx * tangents[i])} ${r(b.x - dx)} ${r(b.y - dx * tangents[i + 1])} ${r(b.x)} ${r(b.y)}`;
  }
  return d;
}

/**
 * Value that changes in steps (a card added): hold flat, then ease into the
 * next value over the last part of the gap. A smooth step, not a cliff.
 */
export function smoothStepPath(pts: XY[], ease = 14): string {
  if (!pts.length) return "";
  let d = `M${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.y === b.y) {
      d += `L${r(b.x)} ${r(b.y)}`;
      continue;
    }
    const width = Math.min(ease, (b.x - a.x) * 0.6);
    const start = b.x - width;
    d += `L${r(start)} ${r(a.y)}`;
    d += `C${r(start + width / 2)} ${r(a.y)} ${r(start + width / 2)} ${r(b.y)} ${r(b.x)} ${r(b.y)}`;
  }
  return d;
}

/** Straight segments. Used for the frames of a range morph. */
export function linePath(pts: XY[]): string {
  return pts.map((pt, i) => `${i ? "L" : "M"}${r(pt.x)} ${r(pt.y)}`).join("");
}

/** The line closed down to the baseline, for the gradient fill. */
export function areaPath(line: string, x0: number, x1: number, baseline: number): string {
  if (!line) return "";
  return `${line}L${r(x1)} ${r(baseline)}L${r(x0)} ${r(baseline)}Z`;
}

/** y at `count` evenly spaced x between x0 and x1, read off straight segments. */
export function resampleY(pts: XY[], x0: number, x1: number, count: number): number[] {
  if (!pts.length) return [];
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? x0 : x0 + ((x1 - x0) * i) / (count - 1);
    while (j < pts.length - 2 && pts[j + 1].x < x) j++;
    const a = pts[j];
    const b = pts[Math.min(j + 1, pts.length - 1)];
    const span = b.x - a.x;
    const t = span > 0 ? Math.min(1, Math.max(0, (x - a.x) / span)) : 0;
    out.push(a.y + (b.y - a.y) * t);
  }
  return out;
}

type Sample = { t: number; value: number; marker?: string | null };

/**
 * Largest-triangle-three-buckets down to about `target` points. The first,
 * last, highest and marked points always stay.
 */
export function downsample<T extends Sample>(points: T[], target = 120): T[] {
  if (points.length <= target || target < 3) return points;
  const keep = new Set<number>([0, points.length - 1]);
  const every = (points.length - 2) / (target - 2);
  let a = 0;
  for (let i = 0; i < target - 2; i++) {
    const start = Math.floor(i * every) + 1;
    const end = Math.min(Math.floor((i + 1) * every) + 1, points.length - 1);
    const nextStart = end;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, points.length);
    let avgT = 0;
    let avgV = 0;
    const span = Math.max(nextEnd - nextStart, 1);
    for (let j = nextStart; j < nextStart + span && j < points.length; j++) {
      avgT += points[j].t;
      avgV += points[j].value;
    }
    avgT /= span;
    avgV /= span;
    let best = start;
    let bestArea = -1;
    for (let j = start; j < end; j++) {
      const area = Math.abs(
        (points[a].t - avgT) * (points[j].value - points[a].value) -
          (points[a].t - points[j].t) * (avgV - points[a].value),
      );
      if (area > bestArea) {
        bestArea = area;
        best = j;
      }
    }
    keep.add(best);
    a = best;
  }
  let high = 0;
  points.forEach((point, index) => {
    if (point.value > points[high].value) high = index;
    if (point.marker) keep.add(index);
  });
  keep.add(high);
  return [...keep].sort((x, y) => x - y).map((index) => points[index]);
}
