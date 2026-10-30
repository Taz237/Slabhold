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

function ticksFor(low: number, high: number, step: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(low / step - 1e-9) * step;
  for (let value = first; value <= high + step * 1e-9 && ticks.length < 12; value += step) {
    ticks.push(clean(value));
  }
  return ticks;
}

export type ValueScale = { domain: [number, number]; ticks: number[] };

/**
 * Y range padded about 10% so the line never touches the edges, and 2 or 3
 * round ticks inside it. Starts at $0 only when the values are near $0.
 */
export function valueScale(values: number[], maxTicks = 3): ValueScale {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { domain: [0, 1], ticks: [] };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : span * 0.1;
  let low = min - pad;
  const high = max + pad;
  if (min >= 0 && (low < 0 || min <= max * 0.1)) low = 0;

  const range = high - low;
  const mag = 10 ** Math.floor(Math.log10(range));
  let best: { step: number; ticks: number[] } | null = null;
  for (const scale of [mag * 10, mag, mag / 10, mag / 100]) {
    for (const base of [5, 2.5, 2, 1]) {
      const step = base * scale;
      const ticks = ticksFor(low, high, step);
      if (ticks.length < 2 || ticks.length > maxTicks) continue;
      // Prefer the most ticks allowed, then the biggest step.
      if (!best || ticks.length > best.ticks.length) best = { step, ticks };
    }
    if (best?.ticks.length === maxTicks) break;
  }
  const ticks = best?.ticks ?? [clean((low + high) / 2)];
  return { domain: [low, high], ticks };
}

function compact(abs: number, unit: number, suffix: string): string {
  return `${clean(abs / unit).toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

/** "$0, $150, $300", "$12.5K", or cents when a tick is not a whole dollar. */
export function axisLabels(ticks: number[]): string[] {
  if (ticks.some((tick) => Math.abs(tick) < 1000 && !Number.isInteger(clean(tick)))) {
    return ticks.map((tick) => money(tick));
  }
  return ticks.map((tick) => {
    const abs = Math.abs(tick);
    const sign = tick < 0 ? "−" : "";
    if (abs >= 1_000_000) return `${sign}$${compact(abs, 1_000_000, "M")}`;
    if (abs >= 1000) return `${sign}$${compact(abs, 1000, "K")}`;
    return `${sign}$${Math.round(abs)}`;
  });
}
