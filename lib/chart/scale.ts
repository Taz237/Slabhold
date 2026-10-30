import { money } from "@/lib/format";

/** A step of 1, 2, 2.5 or 5 times a power of ten, about span / intervals. */
export function niceStep(span: number, intervals: number): number {
  const rough = span / Math.max(intervals, 1);
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / mag;
  const base = [1, 2, 2.5, 5, 10].find((step) => normalized <= step + 1e-9) ?? 10;
  return base * mag;
}

function clean(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** True for 1, 2, 2.5 or 5 times a power of ten. */
function isNice(value: number): boolean {
  if (!(value > 0)) return false;
  const normalized = clean(value / 10 ** Math.floor(Math.log10(value) + 1e-9));
  return [1, 2, 2.5, 5].includes(normalized);
}

/**
 * Three evenly spaced round ticks strictly inside (low, high), centered on the
 * range: $28–$285 gives $50 / $150 / $250. The biggest round step that fits wins.
 */
function threeTicks(low: number, high: number): number[] {
  const range = high - low;
  const inset = range * 0.02;
  const lo = low + inset;
  const hi = high - inset;
  const center = (low + high) / 2;
  const mag = 10 ** Math.floor(Math.log10(range));
  for (const scale of [mag, mag / 10, mag / 100, mag / 1000]) {
    for (const base of [5, 2.5, 2, 1]) {
      const step = base * scale;
      if (2 * step > hi - lo) continue;
      // Ticks may sit on half steps when that half is still round ($50 for a $100 step), not $2.50 for $5.
      const half = step / 2;
      const unit = isNice(half) && (Number.isInteger(clean(half)) || step < 1) ? half : step;
      const first = Math.ceil(lo / unit - 1e-9) * unit;
      const last = Math.floor((hi - 2 * step) / unit + 1e-9) * unit;
      if (first > last + 1e-9) continue;
      const wanted = center - step;
      const start = Math.min(Math.max(Math.round(wanted / unit) * unit, first), last);
      return [clean(start), clean(start + step), clean(start + 2 * step)];
    }
  }
  return [];
}

export type ValueScale = { domain: [number, number]; ticks: number[] };

/**
 * Y range padded about 10% so the line never touches the edges, and exactly 3
 * round ticks inside it. Starts at $0 only when the values are near $0.
 */
export function valueScale(values: number[]): ValueScale {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { domain: [0, 1], ticks: [] };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : span * 0.1;
  let low = min - pad;
  const high = max + pad;
  if (min >= 0 && (low < 0 || min <= max * 0.1)) low = 0;
  return { domain: [low, high], ticks: threeTicks(low, high) };
}

function compact(abs: number, unit: number, suffix: string): string {
  return `${String(Number((abs / unit).toFixed(2)))}${suffix}`;
}

/** "$0, $150, $300", "$12.5K", or cents when a tick is not a whole dollar. */
export function axisLabels(ticks: number[]): string[] {
  if (ticks.some((tick) => Math.abs(tick) < 1000 && !Number.isInteger(clean(tick)))) {
    return ticks.map((tick) => money(tick));
  }
  const short = ticks.map((tick) => {
    const abs = Math.abs(tick);
    const sign = tick < 0 ? "−" : "";
    if (abs >= 1_000_000) return `${sign}$${compact(abs, 1_000_000, "M")}`;
    if (abs >= 1000) return `${sign}$${compact(abs, 1000, "K")}`;
    return `${sign}$${Math.round(abs)}`;
  });
  if (new Set(short).size === short.length) return short;
  // A tight range near $1K ($1,000 / $1,005 / $1,010) needs every dollar.
  return ticks.map((tick) => money(tick).replace(/\.00$/, ""));
}
