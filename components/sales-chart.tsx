"use client";

import { useMemo } from "react";
import { PriceFallbackText } from "@/components/price-readout";
import { ValueChart, type ChartDot, type ChartPoint } from "@/components/charts/value-chart";
import { formatPct } from "@/lib/chart/range";
import { saleTrend, splitOutliers, vsDaysAgo, type ChartSale } from "@/lib/chart/sales";
import { soldSourceLabel } from "@/lib/comps/public-types";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { formatDate, money } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import { mockValueHistory, type ValuePoint } from "@/lib/value-history";

/** A trend needs this many sales on the line. */
export const TREND_MIN_SALES = 3;

const CHART_HEIGHT = 176;

/** "Needs 2 more sales to show a trend". */
export function moreSalesText(count: number): string {
  const missing = Math.max(TREND_MIN_SALES - count, 0);
  return `Needs ${missing} more sale${missing === 1 ? "" : "s"} to show a trend`;
}

/** "$36.00 · PSA 10 · Oct 9, 2026 · Recent sold" */
export function saleLine(sale: ChartSale): string {
  return [money(sale.price), sale.grade, formatDate(sale.date), sale.source ? soldSourceLabel(sale.source) : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Recent sales on a card page: the price, how it moved, and every sale as a
 * dot on one shared <ValueChart>. Tap a dot (or a row in Recent sales) to see
 * that sale. Outliers are hollow and left off the trend.
 */
export function SalesChart({
  card,
  points: pointsProp,
  sales: salesProp,
  selectedSaleId = null,
  onSelectSale,
  fetchedAt,
  source = "sample",
  loading = false,
  median = null,
  p25 = null,
  p75 = null,
  count = 0,
  sample = true,
  unavailable = false,
  noSalesLabel,
  /** Headline and count come from the comps on this card, not a separate estimate. */
  lockedToComps = false,
  heading,
  stableLayout = false,
  /** Replaces the dollar headline. A fallback must set headlineIsEstimate false. */
  headlineLabel,
  headlineIsEstimate = true,
}: {
  card: { id: string; estimatedSellPrice: number; purchasePrice: number };
  points?: ValuePoint[] | null;
  /** The sales listed under the chart, one dot each. */
  sales?: ChartSale[] | null;
  selectedSaleId?: string | null;
  onSelectSale?: (id: string | null) => void;
  /** When we last checked for sales. */
  fetchedAt?: string | null;
  source?: "trawl" | "sample" | "off";
  loading?: boolean;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  count?: number;
  sample?: boolean;
  unavailable?: boolean;
  noSalesLabel?: string;
  lockedToComps?: boolean;
  /** Kept for callers; empty comps show "Not enough sales yet". */
  hideStatusLabel?: boolean;
  /** Replaces the Sold comps / Estimated value eyebrow. */
  heading?: string;
  /** Keep the plot box mounted so an empty result does not collapse the page. */
  stableLayout?: boolean;
  headlineLabel?: string | null;
  /** False when headlineLabel is a last sale, a range, or another fallback. */
  headlineIsEstimate?: boolean;
}) {
  const usingLive = source === "trawl" && !sample;
  const live = usingLive || lockedToComps;
  const showSample = !lockedToComps && (sample || source === "sample" || source === "off");

  const sales = useMemo(
    () => (live ? (salesProp ?? (pointsProp ?? []).map((point, index) => ({ id: `p${index}`, price: point.value, date: point.date }))) : []),
    [live, salesProp, pointsProp],
  );
  const split = useMemo(() => splitOutliers(sales), [sales]);
  const trend = useMemo(() => (split.inliers.length >= TREND_MIN_SALES ? saleTrend(split.inliers) : []), [split]);
  const { id: cardId, estimatedSellPrice, purchasePrice } = card;
  const samplePoints = useMemo<ChartPoint[]>(
    () =>
      showSample
        ? mockValueHistory({ id: cardId, estimatedSellPrice, purchasePrice }).map((point) => ({
            date: point.date,
            value: point.value,
          }))
        : [],
    [showSample, cardId, estimatedSellPrice, purchasePrice],
  );
  const dots = useMemo<ChartDot[]>(() => {
    const hollow = new Set(split.outliers.map((sale) => sale.id));
    return sales.map((sale) => ({ id: sale.id, date: sale.date, value: sale.price, hollow: hollow.has(sale.id) }));
  }, [sales, split]);

  const displayMedian = lockedToComps
    ? median
    : usingLive && median != null
      ? median
      : (samplePoints[samplePoints.length - 1]?.value ?? card.estimatedSellPrice);
  const displayP25 = live ? p25 : null;
  const displayP75 = live ? p75 : null;
  const n = live ? count : samplePoints.length;
  const lowConfidence = live && n > 0 && n < 5;
  const noSales = live && (n === 0 || displayMedian == null);
  const showEstimate = headlineIsEstimate !== false;
  const estimateShown = showEstimate && live && !noSales;
  const today = snapshotDateInNewYork();
  const vs = estimateShown && displayMedian != null ? vsDaysAgo(trend, displayMedian, 30, today) : null;
  const trendUp = trend.length >= 2 ? trend[trend.length - 1].value >= trend[0].value : true;
  const tone = showSample ? "brand" : trend.length >= 2 ? (trendUp ? "up" : "down") : "brand";
  const selected = selectedSaleId ? sales.find((sale) => sale.id === selectedSaleId) : null;
  const linePoints = showSample ? samplePoints : trend;
  const showPlot = (live && sales.length > 0 && (!noSales || !showEstimate)) || (showSample && samplePoints.length > 1);
  const outlierCount = split.outliers.length;
  const refValue = estimateShown ? displayMedian : null;
  const refLine = useMemo(
    () => (refValue != null ? { value: refValue, label: `Median ${money(refValue)}` } : null),
    [refValue],
  );
  const bandLow = estimateShown ? displayP25 : null;
  const bandHigh = estimateShown ? displayP75 : null;
  const band = useMemo(
    () => (bandLow != null && bandHigh != null ? { low: bandLow, high: bandHigh } : null),
    [bandLow, bandHigh],
  );
  const ariaLabel = showSample
    ? "Sample price history"
    : `Recent sales${displayMedian != null && estimateShown ? `, median ${money(displayMedian)}` : ""}, ${sales.length} sale${sales.length === 1 ? "" : "s"}${
        vs != null ? `, ${vs >= 0 ? "up" : "down"} ${formatPct(vs, false)} vs 30 days ago` : ""
      }`;

  if (unavailable && !loading) {
    return null;
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
        <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Sold comps</p>
        <p className="mt-2 text-sm text-zinc-500">Loading sold prices…</p>
        <div className="skeleton-shimmer mt-3 rounded-xl bg-zinc-100 dark:bg-white/5" style={{ height: CHART_HEIGHT }} />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">
            {heading ?? (usingLive ? "Sold comps" : "Estimated value")}
          </p>
          <div className={`mt-1 ${stableLayout ? "flex min-h-9 items-end" : ""}`}>
            {!showEstimate ? (
              <p className="max-w-full text-[clamp(0.95rem,3.6vw,1.125rem)] font-semibold tracking-tight leading-snug">
                <PriceFallbackText text={headlineLabel || noSalesLabel || NOT_ENOUGH_SALES_LABEL} />
              </p>
            ) : noSales ? (
              <p className="text-lg font-semibold tracking-tight">
                {noSalesLabel ?? NOT_ENOUGH_SALES_LABEL}
              </p>
            ) : (
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{money(displayMedian ?? 0)}</span>
                {vs != null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      vs >= 0
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    vs 30 days ago: {formatPct(vs)}
                  </span>
                ) : null}
              </p>
            )}
          </div>
          {estimateShown ? (
            <p className="mt-1 min-h-5 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
              Based on {n} sale{n === 1 ? "" : "s"}
              {fetchedAt ? ` · updated ${formatRelativeTime(fetchedAt)}` : ""}
            </p>
          ) : stableLayout ? (
            <p className="mt-1 min-h-5 text-sm text-zinc-500">&nbsp;</p>
          ) : null}
        </div>
        {showEstimate && lowConfidence && !noSales ? (
          <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
            Low confidence
          </span>
        ) : null}
      </div>

      {showPlot || stableLayout ? (
        <div className="mt-3">
          <div className="flex min-h-6 items-center justify-between gap-3 text-xs" aria-live="polite">
            {showSample ? (
              <span className="text-zinc-500 dark:text-zinc-400">Sample history from recent months</span>
            ) : selected ? (
              <span className="truncate font-semibold tabular-nums">{saleLine(selected)}</span>
            ) : showPlot && trend.length < 2 ? (
              <span className="text-zinc-500 dark:text-zinc-400">{moreSalesText(split.inliers.length)}</span>
            ) : showPlot ? (
              <span className="text-zinc-500 dark:text-zinc-400">Tap a sale to see it</span>
            ) : (
              <span>&nbsp;</span>
            )}
            {outlierCount > 0 && showPlot ? (
              <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                {outlierCount} outlier{outlierCount === 1 ? "" : "s"} hidden
              </span>
            ) : null}
          </div>
          <div style={{ height: CHART_HEIGHT }}>
            {showPlot ? (
              <ValueChart
                points={linePoints}
                dots={showSample ? undefined : dots}
                selectedDotId={selectedSaleId}
                onSelectDot={onSelectSale}
                tone={tone}
                height={CHART_HEIGHT}
                ariaLabel={ariaLabel}
                refLine={refLine}
                band={band}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
