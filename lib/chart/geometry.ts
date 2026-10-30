const DAY = 86_400_000;

/** Noon UTC of a YYYY-MM-DD, so every day sits one step apart. */
export function toDayMs(ymd: string): number {
  return Date.parse(`${ymd.slice(0, 10)}T12:00:00Z`);
}

export function xScale(t0: number, t1: number, x0: number, x1: number): (t: number) => number {
  if (t1 <= t0) return () => (x0 + x1) / 2;
  return (t) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
}

/** Top is the high end of the domain. */
export function yScale(domain: [number, number], top: number, bottom: number): (value: number) => number {
  const [low, high] = domain;
  const span = high - low || 1;
  return (value) => bottom - ((value - low) / span) * (bottom - top);
}

/** Index of the x nearest the finger. xs must be sorted. */
export function nearestIndex(xs: number[], x: number): number {
  if (!xs.length) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[hi] - x) < Math.abs(xs[lo] - x) ? hi : lo;
}

function label(t: number, long: boolean): string {
  const date = new Date(t);
  if (long) {
    const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return `${month} '${String(date.getUTCFullYear()).slice(2)}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export type DateTick = { t: number; label: string };

/** At most `max` evenly spaced dates, first and last included, no repeats. */
export function dateTicks(t0: number, t1: number, max = 4): DateTick[] {
  const long = t1 - t0 > 200 * DAY;
  if (t1 - t0 < DAY / 2) return [{ t: t0, label: label(t0, long) }];
  const days = Math.round((t1 - t0) / DAY);
  const count = Math.max(2, Math.min(max, days + 1));
  const ticks: DateTick[] = [];
  for (let i = 0; i < count; i++) {
    const raw = t0 + ((t1 - t0) * i) / (count - 1);
    const t = t0 + Math.round((raw - t0) / DAY) * DAY;
    const text = label(t, long);
    if (ticks.some((tick) => tick.label === text)) continue;
    ticks.push({ t, label: text });
  }
  return ticks;
}

/** All-time-high point of the shown series. The latest wins a tie. */
export function athIndex(points: { value: number }[]): number {
  let best = -1;
  points.forEach((point, index) => {
    if (best < 0 || point.value >= points[best].value) best = index;
  });
  return best;
}
