import { addDays } from "./range";
import { toDayMs } from "./geometry";

/** One sold comp as the card chart draws it. */
export type ChartSale = {
  id: string;
  price: number;
  /** YYYY-MM-DD */
  date: string;
  grade?: string | null;
  source?: string | null;
};

/** Sold comps as chart sales. The id is the row id, so a row and its dot point at each other. */
export function salesFromComps(
  comps: readonly { id: string; soldPrice: number; soldDate: string; condition?: string | null; platform?: string | null }[],
): ChartSale[] {
  return comps
    .filter((comp) => comp.soldPrice > 0 && /^\d{4}-\d{2}-\d{2}/.test(comp.soldDate))
    .map((comp) => ({
      id: comp.id,
      price: comp.soldPrice,
      date: comp.soldDate.slice(0, 10),
      grade: comp.condition && comp.condition !== "—" ? comp.condition : null,
      source: comp.platform ?? null,
    }));
}

/** Linear-interpolated quantile of prices sorted low to high. */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Below this many sales nothing is called an outlier. */
export const OUTLIER_MIN_SALES = 5;

export type SalesSplit = {
  inliers: ChartSale[];
  outliers: ChartSale[];
  p25: number | null;
  p75: number | null;
};

/**
 * Sales far outside the middle 50% (beyond 1.5x the spread past either
 * quartile). They stay on the chart as hollow dots but leave the trend.
 */
export function splitOutliers(sales: ChartSale[]): SalesSplit {
  const prices = sales.map((sale) => sale.price).sort((a, b) => a - b);
  const p25 = quantile(prices, 0.25);
  const p75 = quantile(prices, 0.75);
  if (sales.length < OUTLIER_MIN_SALES || p25 == null || p75 == null) {
    return { inliers: sales, outliers: [], p25, p75 };
  }
  const median = quantile(prices, 0.5) ?? 0;
  const spread = Math.max(p75 - p25, median * 0.1);
  const low = p25 - spread * 1.5;
  const high = p75 + spread * 1.5;
  const inliers: ChartSale[] = [];
  const outliers: ChartSale[] = [];
  for (const sale of sales) (sale.price < low || sale.price > high ? outliers : inliers).push(sale);
  return { inliers, outliers, p25, p75 };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5) ?? 0;
}

/** One value per sale day (that day's median), then a 3-day rolling median. Ends stay raw. */
export function saleTrend(sales: ChartSale[]): { date: string; value: number }[] {
  const byDay = new Map<string, number[]>();
  for (const sale of sales) {
    const list = byDay.get(sale.date) ?? [];
    list.push(sale.price);
    byDay.set(sale.date, list);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prices]) => ({ date, value: median(prices) }));
  return days.map((day, index) => {
    if (index === 0 || index === days.length - 1) return day;
    return { date: day.date, value: median([days[index - 1].value, day.value, days[index + 1].value]) };
  });
}

/** % change from the trend `days` ago to now. Null when the trend starts later. */
export function vsDaysAgo(
  trend: { date: string; value: number }[],
  now: number,
  days: number,
  today: string,
): number | null {
  if (trend.length < 2) return null;
  const target = addDays(today, -days);
  if (trend[0].date > target) return null;
  const t = toDayMs(target);
  let past = trend[trend.length - 1].value;
  for (let i = 1; i < trend.length; i++) {
    if (trend[i].date < target) continue;
    const a = trend[i - 1];
    const b = trend[i];
    const ta = toDayMs(a.date);
    const tb = toDayMs(b.date);
    past = tb > ta ? a.value + ((b.value - a.value) * (t - ta)) / (tb - ta) : b.value;
    break;
  }
  if (!(past > 0)) return null;
  return ((now - past) / past) * 100;
}
