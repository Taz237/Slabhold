import { money } from "@/lib/format";

/**
 * The scan's sales chart: one dot per real sold sale, by day and price. Dots, never a line, so the
 * chart can't suggest sales that didn't happen. Pure geometry; the component draws it.
 */

export type DotSale = { priceCents: number; soldAt: string | null };

export type SalesDot = { x: number; y: number; priceCents: number; soldAt: string; newest: boolean };

export type SalesDotsChart = {
  dots: SalesDot[];
  /** The value's y, when the sheet has one. */
  medianY: number | null;
  /** Where most sales landed (the middle half). */
  band: { top: number; bottom: number } | null;
  firstDay: string;
  lastDay: string;
};

const PAD = 6;
const MIN_SALES = 3;
/** Sales on the same day sit this far apart, so none hides another. */
const SAME_DAY_STEP = 7;

function dayMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function dated(sales: readonly DotSale[]): { priceCents: number; soldAt: string; t: number }[] {
  return sales
    .filter((sale): sale is { priceCents: number; soldAt: string } => Boolean(sale.soldAt) && sale.priceCents > 0)
    .map((sale) => ({ ...sale, t: dayMs(sale.soldAt) }))
    .filter((sale) => Number.isFinite(sale.t))
    .sort((a, b) => a.t - b.t);
}

export function salesDots(
  sales: readonly DotSale[],
  box: { width: number; height: number; medianCents?: number | null; lowCents?: number | null; highCents?: number | null },
): SalesDotsChart | null {
  const list = dated(sales);
  if (list.length < MIN_SALES) return null;
  const prices = [...list.map((sale) => sale.priceCents), box.medianCents ?? 0, box.lowCents ?? 0, box.highCents ?? 0].filter((value) => value > 0);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const span = highest - lowest || 1;
  const first = list[0].t;
  const last = list[list.length - 1].t;
  const time = last - first || 1;
  const innerW = box.width - PAD * 2;
  const innerH = box.height - PAD * 2;
  const y = (cents: number) => (highest === lowest ? box.height / 2 : PAD + (1 - (cents - lowest) / span) * innerH);
  const seen = new Map<number, number>();
  const dots = list.map((sale, index) => {
    const base = last === first ? box.width / 2 : PAD + ((sale.t - first) / time) * innerW;
    const stacked = seen.get(sale.t) ?? 0;
    seen.set(sale.t, stacked + 1);
    const x = Math.min(box.width - PAD, Math.max(PAD, base + stacked * SAME_DAY_STEP));
    return { x, y: y(sale.priceCents), priceCents: sale.priceCents, soldAt: sale.soldAt, newest: index === list.length - 1 };
  });
  const band = box.lowCents && box.highCents && box.highCents > box.lowCents ? { top: y(box.highCents), bottom: y(box.lowCents) } : null;
  return {
    dots,
    medianY: box.medianCents ? y(box.medianCents) : null,
    band,
    firstDay: list[0].soldAt,
    lastDay: list[list.length - 1].soldAt,
  };
}

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The chart in words, for screen readers. */
export function salesDotsLabel(sales: readonly DotSale[]): string {
  const list = dated(sales);
  if (list.length === 0) return "";
  const prices = list.map((sale) => sale.priceCents);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const from = day(list[0].soldAt);
  const to = day(list[list.length - 1].soldAt);
  const when = from === to ? `on ${from}` : `from ${from} to ${to}`;
  const range = low === high ? `${money(low / 100)} each` : `${money(low / 100)} to ${money(high / 100)}`;
  return `${list.length} ${list.length === 1 ? "sale" : "sales"} ${when}, ${range}`;
}
