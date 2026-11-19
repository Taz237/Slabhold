import { dateTicks, toDayMs, xScale, yScale } from "./geometry";
import { areaPath, linePath, type XY } from "./path";
import type { ChartSale } from "./sales";

/**
 * The card page's sales chart, as plain numbers. The line runs through the
 * real sales only, in straight segments: no smoothing, no trend, no points
 * that never sold. Outliers stay on as hollow dots, off the line and the scale.
 */

/** Room around the plot: the tooltip above, the dates below, the price labels on the right. */
export const SALE_PLOT = { top: 30, bottom: 26, gutter: 50 } as const;
/** Price labels this close to the value label step aside. */
const LABEL_CLEAR = 14;

export type SaleDot = XY & { sale: ChartSale; hollow: boolean };

export type SalePlot = {
  /** Every sale, left to right. One dot each. */
  dots: SaleDot[];
  /** The line's corners, in drawing order: the sales that are not outliers. */
  vertices: SaleDot[];
  line: string;
  area: string;
  plotRight: number;
  top: number;
  bottom: number;
  /** The current value, marked once. */
  value: { y: number; label: string } | null;
  /** The highest and lowest sale on the line. */
  ticks: { y: number; label: string }[];
  dates: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
};

/** "$212", "$28.50", "$1.25K": short enough for the label gutter. */
export function plotMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${Number((abs / 1_000_000).toFixed(2))}M`;
  if (abs >= 1000) return `$${Number((abs / 1000).toFixed(2))}K`;
  if (abs >= 100 || Number.isInteger(Math.round(abs * 100) / 100)) return `$${Math.round(abs)}`;
  return `$${abs.toFixed(2)}`;
}

/**
 * The order the line visits the sales: by day, and inside a day whichever way
 * (up or down) starts nearest the last price, so same-day sales don't zigzag.
 */
export function saleLineOrder(sales: readonly ChartSale[]): ChartSale[] {
  const byDay = new Map<string, ChartSale[]>();
  for (const sale of sales) {
    const day = byDay.get(sale.date);
    if (day) day.push(sale);
    else byDay.set(sale.date, [sale]);
  }
  const out: ChartSale[] = [];
  let last: number | null = null;
  for (const date of [...byDay.keys()].sort()) {
    const day = byDay.get(date)!.slice().sort((a, b) => a.price - b.price);
    const up = last == null || Math.abs(last - day[0].price) <= Math.abs(last - day[day.length - 1].price);
    out.push(...(up ? day : day.reverse()));
    last = out[out.length - 1].price;
  }
  return out;
}

export function buildSalePlot(input: {
  sales: readonly ChartSale[];
  /** Ids of the outliers: hollow, off the line. */
  hollow?: ReadonlySet<string>;
  /** The current value (the headline), or null when there is none. */
  value?: number | null;
  width: number;
  height: number;
}): SalePlot | null {
  const { sales, width, height } = input;
  if (!sales.length || !(width > 0)) return null;
  const hollow = input.hollow ?? new Set<string>();
  const solid = sales.filter((sale) => !hollow.has(sale.id));
  const scaled = solid.length ? solid : [...sales];
  const prices = scaled.map((sale) => sale.price);
  const value = input.value != null && Number.isFinite(input.value) ? input.value : null;
  const all = value == null ? prices : [...prices, value];
  const min = Math.min(...all);
  const max = Math.max(...all);
  // Generous room, so 1 to 3 sales sit in the middle of the plot, not on its edges.
  const pad = max > min ? (max - min) * 0.22 : Math.max(max * 0.12, 1);
  const low = Math.max(min - pad, 0);
  const high = max + pad;

  const top = SALE_PLOT.top;
  const bottom = height - SALE_PLOT.bottom;
  const plotRight = Math.max(width - SALE_PLOT.gutter, 40);
  const times = sales.map((sale) => toDayMs(sale.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const inset = Math.min(sales.length <= 3 ? plotRight * 0.16 : 10, plotRight / 3);
  const x = xScale(t0, t1, inset, plotRight - inset);
  const y = yScale([low, high], top, bottom);

  const place = (sale: ChartSale): SaleDot => ({
    x: x(toDayMs(sale.date)),
    // An outlier is off the scale: it pins to the edge it is past.
    y: Math.min(Math.max(y(sale.price), top - 8), bottom),
    sale,
    hollow: hollow.has(sale.id),
  });
  const dots = sales.map(place).sort((a, b) => a.x - b.x || b.y - a.y);
  const vertices = saleLineOrder(solid).map(place);
  const line = vertices.length > 1 ? linePath(vertices) : "";

  const valueMark = value == null ? null : { y: y(value), label: plotMoney(value) };
  // One sale carries its own price label, so it needs none in the gutter.
  const ends = sales.length > 1 && prices.length ? [...new Set([Math.max(...prices), Math.min(...prices)])] : [];
  const ticks = ends
    .map((price) => ({ y: y(price), label: plotMoney(price) }))
    .filter((tick) => !valueMark || Math.abs(tick.y - valueMark.y) >= LABEL_CLEAR)
    .filter((tick, index, list) => index === 0 || Math.abs(tick.y - list[0].y) >= LABEL_CLEAR);

  const marks = dateTicks(t0, t1, 2);
  const dates =
    marks.length === 1
      ? [{ x: x(marks[0].t), label: marks[0].label, anchor: "middle" as const }]
      : [
          { x: 0, label: marks[0].label, anchor: "start" as const },
          { x: plotRight, label: marks[marks.length - 1].label, anchor: "end" as const },
        ];

  return {
    dots,
    vertices,
    line,
    area: line ? areaPath(line, vertices[0].x, vertices[vertices.length - 1].x, bottom) : "",
    plotRight,
    top,
    bottom,
    value: valueMark,
    ticks,
    dates,
  };
}

/**
 * The dot under a finger: the nearest by x, and among the dots stacked on
 * that day the nearest by y.
 */
export function nearestDot(dots: readonly XY[], px: number, py: number): number {
  let pick = -1;
  let pickDx = Infinity;
  let pickDy = Infinity;
  dots.forEach((dot, index) => {
    const dx = Math.abs(dot.x - px);
    const dy = Math.abs(dot.y - py);
    if (dx < pickDx - 6 || (Math.abs(dx - pickDx) <= 6 && dy < pickDy)) {
      pick = index;
      pickDx = Math.min(dx, pickDx);
      pickDy = dy;
    }
  });
  return pick;
}
