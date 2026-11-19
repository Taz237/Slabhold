"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SalePlot } from "@/components/card-page/sale-plot";
import { PriceInfo } from "@/components/card-page/price-info";
import {
  PlotEmpty,
  ROUGH_VALUE_NOTE,
  ValueHead,
  cardSection,
  priceInfoLines,
  recentSalesLine,
  valueHeadline,
} from "@/components/card-page/value-head";
import {
  COMP_RANGES,
  TREND_MIN_SALES,
  compRanges,
  salesInCompRange,
  type CompRange,
} from "@/lib/chart/comp-ranges";
import { formatPct, pctTone } from "@/lib/chart/range";
import { saleTrend, splitOutliers, vsDaysAgo, type ChartSale } from "@/lib/chart/sales";
import { MOVE_PILL } from "@/lib/chart/theme";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { soldFreshnessLabel } from "@/lib/comps/freshness";
import { middleFifty } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import type { PriceRead } from "@/lib/value/price-fallback";

/** The price counts up once, about this long. */
const COUNT_UP_MS = 500;

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The big dollar. It counts up once from 60%, so it never reads "$0". Static under reduced motion. */
function CountUp({ value }: { value: number }) {
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

/** "▲ 4.2% · 30d": the change and what it compares to, in one pill. */
export function ChangePill({ pct }: { pct: number }) {
  const tone = pctTone(pct);
  const text = tone === "up" ? `▲ ${formatPct(pct, false)}` : tone === "down" ? `▼ ${formatPct(pct, false)}` : "0%";
  const said = tone === "flat" ? "No change" : `${tone === "up" ? "Up" : "Down"} ${formatPct(pct, false)}`;
  return (
    <span
      data-change-pill={tone}
      className={`comp-chip-in shrink-0 rounded-full px-2 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap tabular-nums ${MOVE_PILL[tone]}`}
    >
      <span aria-hidden="true">{text} · 30d</span>
      <span className="sr-only">{said} vs 30 days ago</span>
    </span>
  );
}

/**
 * The card page's value section: the head (one price, one pill, one line, ⓘ)
 * over the sales chart. The price is the median the page worked out from the
 * sales on screen; nothing here changes that math. A shorter range reads its
 * own median, as before.
 */
export function CardValue({
  read,
  amount = null,
  count = 0,
  sales: salesProp,
  selectedSaleId = null,
  onSelectSale,
  fetchedAt,
  live = false,
  sample = false,
  rough,
  similarLabel,
  children,
}: {
  /** The page's price read (resolvePriceRead). */
  read: PriceRead | null;
  /** The estimate in dollars, when the read is an estimate. */
  amount?: number | null;
  /** How many sales the read is built from. */
  count?: number;
  /** The live sales listed under the chart, one dot each. */
  sales?: ChartSale[] | null;
  selectedSaleId?: string | null;
  onSelectSale?: (id: string | null) => void;
  /** When we last checked for sales. */
  fetchedAt?: string | null;
  /** Real sold prices are on screen, so ⓘ carries the credit. */
  live?: boolean;
  sample?: boolean;
  /** The caller's call on thin data. Defaults to 1 to 4 sales. */
  rough?: boolean;
  similarLabel?: string;
  /** Under an empty plot: the sold-search link, when it helps. */
  children?: ReactNode;
}) {
  const today = snapshotDateInNewYork();
  const allSales = useMemo<ChartSale[]>(() => (live ? (salesProp ?? []) : []), [live, salesProp]);
  const ranges = useMemo(() => compRanges(allSales, today), [allSales, today]);
  const [chosenRange, setChosenRange] = useState<CompRange>("all");
  const range: CompRange = ranges.includes(chosenRange) ? chosenRange : "all";
  const zoomed = range !== "all";
  const sales = useMemo(() => salesInCompRange(allSales, range, today), [allSales, range, today]);
  // A shorter range reads its own median. All is exactly the page's read.
  const windowRead = useMemo(() => (zoomed ? middleFifty(sales.map((sale) => sale.price)) : null), [zoomed, sales]);
  const split = useMemo(() => splitOutliers(sales), [sales]);
  const hollowIds = useMemo(() => new Set(split.outliers.map((sale) => sale.id)), [split]);

  const isEstimate = read?.kind === "estimate";
  const median = isEstimate ? (windowRead ? windowRead.median : amount) : null;
  const n = windowRead ? sales.length : count;
  const estimateShown = isEstimate && median != null && n > 0;
  // The pill needs enough sales for a 30-day comparison. The trend is only this number, never a drawn line.
  const trend = useMemo(
    () => (split.inliers.length >= TREND_MIN_SALES ? saleTrend(split.inliers) : []),
    [split],
  );
  const vs = estimateShown && median != null ? vsDaysAgo(trend, median, 30, today) : null;
  const isRough = rough ?? (n > 0 && n < 5);

  const base = valueHeadline(read, similarLabel);
  const phrase = COMP_RANGES.find((item) => item.id === range)?.phrase ?? "";
  const line = sample
    ? "Sample estimate"
    : recentSalesLine(n, { rough: isRough && (isEstimate || read?.kind === "range"), note: zoomed ? phrase : base?.note });
  // "Newest sale Sep 30 · checked 7 hours ago", the same words the sold list used to carry.
  const freshness = live ? soldFreshnessLabel(allSales.map((sale) => ({ soldDate: sale.date })), fetchedAt) : "";
  const info = live
    ? priceInfoLines([
        estimateShown ? "The value is the middle price of the recent sales below" : null,
        vs != null ? "The change compares it with 30 days ago" : null,
        isRough ? ROUGH_VALUE_NOTE : null,
        split.outliers.length ? "Hollow dots are outliers, left off the line" : null,
        freshness || null,
      ])
    : [];
  const ariaLabel = `Recent sales${estimateShown && median != null ? `, value ${money(median)}` : ""}, ${sales.length} sale${
    sales.length === 1 ? "" : "s"
  }${vs == null ? "" : `, ${pctTone(vs) === "flat" ? "unchanged" : `${pctTone(vs)} ${formatPct(vs, false)}`} vs 30 days ago`}`;
  const selected = selectedSaleId ? allSales.find((sale) => sale.id === selectedSaleId) : null;

  return (
    <section data-comp-card="" data-slot="sales-chart" className={`comp-reveal ${cardSection}`}>
      <ValueHead
        headline={base}
        price={estimateShown && median != null ? <CountUp value={median} /> : undefined}
        chip={vs != null ? <ChangePill pct={vs} /> : null}
        line={line}
        info={info.length ? <PriceInfo lines={info} /> : null}
        aside={
          ranges.length > 1 ? (
            <div role="group" aria-label="Sales range" data-comp-ranges="" className="flex shrink-0 items-center gap-1">
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
                    className={`hit-44 h-8 min-w-11 rounded-full px-2.5 text-xs font-medium tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none ${
                      on
                        ? "bg-zinc-950/[0.07] text-zinc-950 dark:bg-white/10 dark:text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null
        }
      />
      {sales.length > 0 ? (
        <div className="mt-3">
          <SalePlot
            sales={sales}
            hollowIds={hollowIds}
            value={estimateShown ? median : null}
            selectedId={selectedSaleId}
            onSelect={onSelectSale}
            ariaLabel={ariaLabel}
            drawKey={range}
          />
          {/* Read out to screen readers. The tooltip shows it on screen. */}
          <p className="sr-only" aria-live="polite">
            {selected ? [money(selected.price), selected.grade, selected.date].filter(Boolean).join(", ") : ""}
          </p>
        </div>
      ) : (
        <PlotEmpty>{children}</PlotEmpty>
      )}
    </section>
  );
}
