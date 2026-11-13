"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PriceFallbackText } from "@/components/price-readout";
import { ValueChart, type ChartDot, type ChartPoint } from "@/components/charts/value-chart";
import { medianLayers } from "@/components/charts/median-layer";
import {
  COMP_PLOT_HEIGHT,
  CompCardSkeleton,
  GhostPlot,
  compCaption,
  compCard,
  compHeroValue,
  compLabel,
  compSectionValue,
  compTile,
  saleDate,
} from "@/components/comp-basis";
import { formatPct, pctTone, rangeStart, type RangeId } from "@/lib/chart/range";
import { middleFifty } from "@/lib/comps/stats";
import { saleTrend, splitOutliers, vsDaysAgo, type ChartSale } from "@/lib/chart/sales";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { money } from "@/lib/format";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import { mockValueHistory, type ValuePoint } from "@/lib/value-history";
import { MOVE_PILL } from "@/lib/chart/theme";
import { PRICE_BASIS_LINE } from "@/lib/comps/price-basis";

/** A trend needs this many sales on the line. */
export const TREND_MIN_SALES = 3;

const CHART_HEIGHT = COMP_PLOT_HEIGHT;
/** The hero counts up once, about this long. */
const COUNT_UP_MS = 500;

/** "Needs 2 more sales to show a trend". */
export function moreSalesText(count: number): string {
  const missing = Math.max(TREND_MIN_SALES - count, 0);
  return `Needs ${missing} more sale${missing === 1 ? "" : "s"} to show a trend`;
}

export { saleDate };

export const TRAWL_ATTRIBUTION = "Sold data via Trawl (third-party, not affiliated with eBay)";
/** Under a real median: what currency and market the comps come from. */
export { PRICE_BASIS_LINE };

/** "2h ago", "3d ago", "just now". Empty when there is no real time. */
export function shortAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "▲ 4.2%", "▼ 3.1%" or "– 0%". The period goes in the caption. */
export function DeltaChip({ pct, className = "" }: { pct: number; className?: string }) {
  const tone = pctTone(pct);
  const text = tone === "up" ? `▲ ${formatPct(pct, false)}` : tone === "down" ? `▼ ${formatPct(pct, false)}` : "– 0%";
  return (
    <span
      data-delta-chip={tone}
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${MOVE_PILL[tone]} ${className}`}
    >
      {text}
    </span>
  );
}

function pct(value: number, lo: number, hi: number): number {
  if (!(hi > lo)) return 50;
  return Math.min(100, Math.max(0, ((value - lo) / (hi - lo)) * 100));
}

/**
 * Where the middle half of sales lands. A zinc track, the p25–p75 run in faint
 * violet, and the median as a 2px tick. Pure CSS.
 */
export function RangeBar({
  low,
  high,
  median,
  min,
  max,
}: {
  low: number;
  high: number;
  median: number;
  /** The cheapest and dearest sale, when known. The track pads out to them. */
  min?: number | null;
  max?: number | null;
}) {
  const pad = Math.max((high - low) * 0.5, high * 0.05, 0.01);
  const lo = Math.min(low, min ?? low - pad);
  const hi = Math.max(high, max ?? high + pad);
  const left = pct(low, lo, hi);
  const right = pct(high, lo, hi);
  const mid = pct(median, lo, hi);
  return (
    <div data-range-bar="" className={`mt-4 px-3 py-3 ${compTile}`}>
      <div
        role="img"
        aria-label={`Middle half of sales, ${money(low)} to ${money(high)}`}
        className="relative h-1.5 rounded-full bg-zinc-200 dark:bg-white/10"
      >
        <span
          className="absolute inset-y-0 rounded-full bg-violet-600/25"
          style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
        />
        <span
          className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-violet-600"
          style={{ left: `${mid}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-3 leading-4 tabular-nums">
        <span className={compCaption}>Low {money(low)}</span>
        <span className={compCaption}>High {money(high)}</span>
      </div>
    </div>
  );
}

export function TrawlAttribution() {
  return (
    <p className={`mt-4 border-t border-zinc-950/5 pt-3 leading-4 dark:border-white/[0.06] ${compCaption}`}>
      {TRAWL_ATTRIBUTION}
    </p>
  );
}

/** A tapped sale's source, short enough to share a line with "1 outlier hidden". */
export function saleSourceShort(source: string): string {
  return source.trim().toLowerCase() === "ebay" ? "eBay" : "Sold";
}

/** "$36.00 · PSA 10 · Oct 9" */
export function saleLineMain(sale: ChartSale, today?: string): string {
  return [money(sale.price), sale.grade, saleDate(sale.date, today)].filter(Boolean).join(" · ");
}

/** "$36.00 · PSA 10 · Oct 9 · eBay" */
export function saleLine(sale: ChartSale, today?: string): string {
  return [saleLineMain(sale, today), sale.source ? saleSourceShort(sale.source) : null].filter(Boolean).join(" · ");
}

/** "PSA 10 · Oct 9 · eBay": a tapped sale's caption, under its price in the hero. */
export function saleMeta(sale: ChartSale, today?: string): string {
  return [sale.grade, saleDate(sale.date, today), sale.source ? saleSourceShort(sale.source) : null]
    .filter(Boolean)
    .join(" · ");
}

/** The comp chart's zoom ranges. All is the default and always today's read. */
export const COMP_RANGES: { id: Extract<RangeId, "30d" | "90d" | "all">; label: string; days: number | null; phrase: string }[] = [
  { id: "30d", label: "30D", days: 30, phrase: "past 30 days" },
  { id: "90d", label: "90D", days: 90, phrase: "past 90 days" },
  { id: "all", label: "All", days: null, phrase: "" },
];

export type CompRange = (typeof COMP_RANGES)[number]["id"];

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}

/**
 * Ranges worth a chip: a shorter window shows only when the sales span more
 * than it and at least TREND_MIN_SALES of them fall inside. Empty (no chips)
 * when only All would show, which is most comps (about 30 days of sales).
 */
export function compRanges(sales: { date: string }[], today: string): CompRange[] {
  if (sales.length < TREND_MIN_SALES) return [];
  const dates = sales.map((sale) => sale.date).sort();
  const span = dayCount(dates[0], dates[dates.length - 1]);
  const shorter = COMP_RANGES.filter((range) => {
    if (range.days == null) return false;
    const start = rangeStart(range.id, today) ?? "";
    const inside = dates.filter((date) => date >= start).length;
    return span > range.days && inside >= TREND_MIN_SALES && inside < dates.length;
  }).map((range) => range.id);
  return shorter.length ? [...shorter, "all"] : [];
}

/** The sales inside a comp range. All is every sale. */
export function salesInCompRange<T extends { date: string }>(sales: T[], range: CompRange, today: string): T[] {
  const start = range === "all" ? null : rangeStart(range, today);
  return start == null ? sales : sales.filter((sale) => sale.date >= start);
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The hero dollar. It counts up once, from 60% so it never reads "$0", on the
 * client's first draw of a real value. Static under reduced motion.
 */
function HeroMoney({ value }: { value: number }) {
  const [shown, setShown] = useState<number | null>(null);
  const ran = useRef(false);
  useClientLayoutEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!window.requestAnimationFrame || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const from = value * 0.6;
    let frame = 0;
    let start = 0;
    setShown(from);
    const step = (time: number) => {
      start ||= time;
      const progress = Math.min(1, (time - start) / COUNT_UP_MS);
      if (progress < 1) {
        setShown(from + (value - from) * (1 - (1 - progress) ** 3));
        frame = window.requestAnimationFrame(step);
      } else {
        setShown(null);
      }
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      setShown(null);
    };
  }, [value]);
  return <>{money(shown ?? value)}</>;
}

/**
 * The card page's one comp read: the label and freshness, the value with its
 * 30-day chip, the middle-half range, and every sale as a dot on one shared
 * <ValueChart>. Tap a dot (or a row in Recent sales) and the hero shows that
 * sale. Outliers are hollow and left off the trend.
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
  lowConfidence: lowConfidenceProp,
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
  /** The eyebrow: "Last sale", "Recent sales", "Estimated value" or similar cards. */
  heading?: string;
  /** Keep the plot box mounted so an empty result does not collapse the page. */
  stableLayout?: boolean;
  headlineLabel?: string | null;
  /** False when headlineLabel is a last sale, a range, or another fallback. */
  headlineIsEstimate?: boolean;
  /** The caller's call on the amber "Low confidence" tag, so its page never shows it twice. */
  lowConfidence?: boolean;
}) {
  const usingLive = source === "trawl" && !sample;
  const live = usingLive || lockedToComps;
  const showSample = !lockedToComps && (sample || source === "sample" || source === "off");

  const allSales = useMemo<ChartSale[]>(
    () => (live ? (salesProp ?? (pointsProp ?? []).map((point, index) => ({ id: `p${index}`, price: point.value, date: point.date }))) : []),
    [live, salesProp, pointsProp],
  );
  const today = snapshotDateInNewYork();
  const ranges = useMemo(() => compRanges(allSales, today), [allSales, today]);
  const [chosenRange, setChosenRange] = useState<CompRange>("all");
  const range: CompRange = ranges.includes(chosenRange) ? chosenRange : "all";
  const zoomed = range !== "all";
  const sales = useMemo(() => salesInCompRange(allSales, range, today), [allSales, range, today]);
  // A shorter range reads its own median and middle half. All is exactly today's read.
  const windowRead = useMemo(() => (zoomed ? middleFifty(sales.map((sale) => sale.price)) : null), [zoomed, sales]);
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

  const displayMedian = windowRead
    ? windowRead.median
    : lockedToComps
      ? median
      : usingLive && median != null
        ? median
        : (samplePoints[samplePoints.length - 1]?.value ?? card.estimatedSellPrice);
  const displayP25 = windowRead ? windowRead.p25 : live ? p25 : null;
  const displayP75 = windowRead ? windowRead.p75 : live ? p75 : null;
  const n = windowRead ? sales.length : live ? count : samplePoints.length;
  const lowConfidence = lowConfidenceProp ?? (live && n > 0 && n < 5);
  const noSales = live && (n === 0 || displayMedian == null);
  const showEstimate = headlineIsEstimate !== false;
  const estimateShown = showEstimate && live && !noSales;
  const vs = estimateShown && displayMedian != null ? vsDaysAgo(trend, displayMedian, 30, today) : null;
  const vsTone = pctTone(vs);
  const selected = selectedSaleId ? allSales.find((sale) => sale.id === selectedSaleId) : null;
  const linePoints = showSample ? samplePoints : trend;
  const showPlot = (live && sales.length > 0 && (!noSales || !showEstimate)) || (showSample && samplePoints.length > 1);
  const outlierCount = split.outliers.length;
  const refValue = estimateShown ? displayMedian : null;
  const refLine = useMemo(
    () => (refValue != null ? { value: refValue, label: `Median ${money(refValue)}` } : null),
    [refValue],
  );
  const showRange = estimateShown && displayMedian != null && displayP25 != null && displayP75 != null;
  const inlierPrices = split.inliers.map((sale) => sale.price);
  const ariaLabel = showSample
    ? "Sample price history"
    : `Recent sales${displayMedian != null && estimateShown ? `, median ${money(displayMedian)}` : ""}, ${sales.length} sale${sales.length === 1 ? "" : "s"}${
        vs == null ? "" : vsTone === "flat" ? ", unchanged vs 30 days ago" : `, ${vsTone} ${formatPct(vs, false)} vs 30 days ago`
      }`;
  const eyebrow = heading ?? (showEstimate ? "Estimated value" : "Recent sales");
  const ago = usingLive ? shortAgo(fetchedAt) : "";
  const freshness = showSample ? "Sample" : ago ? `Recent sold · ${ago}` : null;
  const fewSales = split.inliers.length < TREND_MIN_SALES;
  const chip = !selected && estimateShown && !fewSales && vs != null;
  // The USD line sits under real sold prices, and stays while a sale is tapped. Never on sample data.
  const basisShown = estimateShown && usingLive;
  // One tone for the line, its fill, its dots and the chip: the 30-day trend when the chip shows, else purple.
  const lineTone = chip ? vsTone : "brand";
  const chartBand = useMemo(
    () => (showRange && !fewSales && displayP25 != null && displayP75 != null ? { low: displayP25, high: displayP75 } : null),
    [showRange, fewSales, displayP25, displayP75],
  );
  const phrase = COMP_RANGES.find((item) => item.id === range)?.phrase ?? "";

  if (unavailable && !loading) {
    return null;
  }

  if (loading) {
    return <CompCardSkeleton range={showEstimate} />;
  }

  const caption = selected ? (
    saleMeta(selected, today)
  ) : showSample ? (
    "Sample history from recent months"
  ) : noSales && showEstimate ? (
    "We'll show a value once this card has a recent sale."
  ) : fewSales ? (
    moreSalesText(split.inliers.length)
  ) : estimateShown ? (
    `Based on ${n} sale${n === 1 ? "" : "s"}${zoomed ? ` · ${phrase}` : ""}${chip ? " · vs 30 days ago" : ""}`
  ) : (
    `Based on ${sales.length} sale${sales.length === 1 ? "" : "s"}`
  );

  return (
    <section data-comp-card="" className={`comp-reveal ${compCard}`}>
      <div className="flex h-5 items-center justify-between gap-3">
        <p className={`min-w-0 truncate ${compLabel}`}>{eyebrow}</p>
        {freshness ? <p className={`shrink-0 ${compCaption}`}>{freshness}</p> : null}
      </div>

      <div className="mt-1 flex min-h-10 items-baseline gap-2">
        {selected ? (
          <p key={`sale-${selected.id}`} data-comp-value="" className={`comp-fade ${compHeroValue}`}>
            {money(selected.price)}
          </p>
        ) : !showEstimate ? (
          <p key="label" className={`comp-fade max-w-full py-1.5 ${compSectionValue}`}>
            <PriceFallbackText text={headlineLabel || noSalesLabel || NOT_ENOUGH_SALES_LABEL} />
          </p>
        ) : noSales ? (
          <p className="text-lg font-semibold tracking-tight leading-10 text-zinc-500">No sales yet</p>
        ) : (
          <>
            <p key="value" data-comp-value="" className={`comp-fade ${compHeroValue}`}>
              <HeroMoney value={displayMedian ?? 0} />
            </p>
            {chip && vs != null ? <DeltaChip pct={vs} className="comp-chip-in" /> : null}
          </>
        )}
      </div>

      <p className={`mt-2 flex min-h-4 min-w-0 items-center gap-1.5 leading-4 ${compCaption}`}>
        <span key={selected ? `c-${selected.id}` : "c"} className="comp-fade min-w-0 truncate tabular-nums">
          {caption}
        </span>
        {!selected && showEstimate && lowConfidence && !noSales ? (
          <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 text-11 leading-4 font-semibold text-amber-800 dark:text-amber-200">
            Low confidence
          </span>
        ) : null}
      </p>
      {basisShown ? <p className={`mt-1 leading-4 ${compCaption}`}>{PRICE_BASIS_LINE}</p> : null}

      {showRange && displayMedian != null && displayP25 != null && displayP75 != null ? (
        <RangeBar
          low={displayP25}
          high={displayP75}
          median={displayMedian}
          min={inlierPrices.length ? Math.min(...inlierPrices) : null}
          max={inlierPrices.length ? Math.max(...inlierPrices) : null}
        />
      ) : null}

      {showPlot ? (
        <div className={`relative mt-4 h-44 px-1 py-3 ${compTile}`}>
          {/* Read out to screen readers. The hero shows the tapped sale on screen. */}
          <div
            data-sale-row=""
            className="flex h-6 items-center justify-between gap-3 overflow-hidden text-xs leading-5 whitespace-nowrap sr-only"
            aria-live="polite"
          >
            {showSample ? (
              <span className="min-w-0 truncate">Sample history from recent months</span>
            ) : selected ? (
              // Only the price, grade and date can truncate. The source always shows.
              <span className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 truncate">{saleLineMain(selected, today)}</span>
                {selected.source ? <span className="shrink-0">· {saleSourceShort(selected.source)}</span> : null}
              </span>
            ) : trend.length < 2 ? (
              <span className="min-w-0 truncate">{moreSalesText(split.inliers.length)}</span>
            ) : (
              <span className="min-w-0 truncate">Tap a sale to see it</span>
            )}
          </div>
          {outlierCount > 0 ? (
            <p aria-hidden="true" className={`pointer-events-none absolute top-1.5 left-3 leading-4 ${compCaption}`}>
              {outlierCount} outlier{outlierCount === 1 ? "" : "s"} hidden
            </p>
          ) : null}
          <ValueChart
            points={linePoints}
            dots={showSample ? undefined : dots}
            selectedDotId={selectedSaleId}
            onSelectDot={onSelectSale}
            tone={lineTone}
            height={CHART_HEIGHT}
            ariaLabel={ariaLabel}
            refLine={refLine}
            band={chartBand}
            layers={medianLayers}
            morphKey={range}
            minimal
          />
        </div>
      ) : stableLayout || (noSales && showEstimate) ? (
        <GhostPlot />
      ) : null}

      {showPlot && ranges.length > 1 ? (
        <div
          role="group"
          aria-label="Sales range"
          data-comp-ranges=""
          className="mt-3 grid gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[0.04]"
          style={{ gridTemplateColumns: `repeat(${ranges.length}, minmax(0, 1fr))` }}
        >
          {COMP_RANGES.filter((item) => ranges.includes(item.id)).map((item) => {
            const on = item.id === range;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onSelectSale?.(null);
                  setChosenRange(item.id);
                }}
                className={`hit-44 h-9 rounded-full text-xs font-semibold tabular-nums outline-none transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none ${
                  on
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {usingLive ? <TrawlAttribution /> : null}
    </section>
  );
}
