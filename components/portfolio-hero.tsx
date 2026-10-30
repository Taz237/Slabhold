"use client";

import Link from "next/link";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Share, TrendingDown, TrendingUp } from "lucide-react";
import { AddCardLink } from "@/components/add-card-link";
import { CardThumb } from "@/components/card-thumb";
import { ValueChart, type ChartPoint } from "@/components/charts/value-chart";
import { shareCollectionValue } from "@/components/collection-value-share";
import {
  availableRanges,
  changeAmount,
  chartSummary,
  formatPct,
  pickRange,
  pointsInRange,
  rangeChange,
  rangePhrase,
  RANGES,
  readStoredRange,
  writeStoredRange,
  type RangeChange,
  type RangeId,
} from "@/lib/chart/range";
import { investedAmountLabel, profitAmountLabel, profitAmountTone } from "@/lib/collection/profit-label";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import {
  useCardValueHistory,
  useCollectionSnapshots,
  type CardHistory,
  type CollectionSnapshots,
} from "@/lib/collection/use-value-history";
import {
  addedMarkers,
  bestCard,
  collectionPoints,
  topMovers,
  type BestCard,
  type MoverCard,
  type Movers,
} from "@/lib/collection/value-series";
import { cardTitle, hasPaid, isSold, money, pct, signedMoney } from "@/lib/format";
import type { SportsCard } from "@/lib/types";
import { shownCardValue } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";

export type PortfolioHeroProps = {
  cardCount: number;
  collectionValue: number;
  profitTotal: number;
  pricedCount: number;
  pricedInvested: number;
  investedAmount: number;
  paidCount: number;
  withoutValueCount: number;
  valuesLoading: boolean;
  valuesFailed: boolean;
  valuesMessage: string | null;
  onRetry: () => void;
  /** Cards in the current lane, for markers, Best card and Top movers. */
  cards?: SportsCard[];
  values?: Map<string, CardValueResult>;
  /** Opens the cards without a value yet. */
  onShowWithoutValue?: () => void;
  /** False for a private collection (no public cards): no Share button. */
  shareable?: boolean;
  /** Tests pass saved days in. The app reads them. */
  snapshots?: CollectionSnapshots;
  /** Tests pass per-card days in. The app reads them. */
  cardHistory?: CardHistory;
};

type HeroCard = MoverCard & { card: SportsCard };

const CHART_ID = "collection";
const CHART_HEIGHT = 184;
const NO_CARDS: SportsCard[] = [];
const NO_VALUES = new Map<string, CardValueResult>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const tile =
  "min-w-0 rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.03]";
const label = "font-mono text-[10.5px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400";
const upText = "text-emerald-700 dark:text-emerald-400";
const downText = "text-rose-700 dark:text-rose-400";

/** Collection value, the chart and ranges, then a 2×2 of stats and Top movers. */
export function PortfolioHero(props: PortfolioHeroProps) {
  const {
    cardCount,
    collectionValue,
    profitTotal,
    pricedCount,
    pricedInvested,
    investedAmount,
    paidCount,
    withoutValueCount,
    valuesLoading,
    valuesFailed,
    valuesMessage,
    onRetry,
    cards = NO_CARDS,
    values = NO_VALUES,
    onShowWithoutValue,
    shareable = false,
  } = props;
  const read = useCollectionSnapshots(props.snapshots === undefined);
  const snapshots = props.snapshots ?? read;
  const read30 = useCardValueHistory(cards.length > 0 && props.cardHistory === undefined);
  const history = props.cardHistory ?? read30;

  const movers = useMemo<HeroCard[]>(
    () =>
      cards.map((card) => ({
        id: card.id,
        playerName: card.playerName,
        paid: hasPaid(card) ? (card.purchasePrice as number) : null,
        value: shownCardValue(card, values.get(card.id)),
        sold: isSold(card),
        card,
      })),
    [cards, values],
  );
  const best = useMemo(() => (valuesLoading || valuesFailed ? null : bestCard(movers)), [movers, valuesLoading, valuesFailed]);
  const top = useMemo(() => topMovers(movers, history), [movers, history]);
  const markers = useMemo(() => addedMarkers(cards), [cards]);

  return (
    <div className="space-y-3">
      <CollectionValueCard
        collectionValue={collectionValue}
        cardCount={cardCount}
        valuesLoading={valuesLoading}
        valuesFailed={valuesFailed}
        valuesMessage={valuesMessage}
        onRetry={onRetry}
        snapshots={snapshots}
        markers={markers}
        shareable={shareable}
      />
      <StatGrid
        invested={investedAmount}
        paidCount={paidCount}
        cardCount={cardCount}
        profit={profitTotal}
        pricedCount={pricedCount}
        pricedInvested={pricedInvested}
        withoutValueCount={withoutValueCount}
        onShowWithoutValue={onShowWithoutValue}
        best={best}
        loading={valuesLoading}
        failed={valuesFailed}
      />
      {!valuesLoading && !valuesFailed && cards.length > 0 ? <TopMovers movers={top} /> : null}
    </div>
  );
}

type ValueCardProps = {
  collectionValue: number;
  cardCount: number;
  valuesLoading: boolean;
  valuesFailed: boolean;
  valuesMessage: string | null;
  onRetry: () => void;
  snapshots: CollectionSnapshots;
  markers: Map<string, string>;
  shareable: boolean;
};

/**
 * The one hero. Scrub state lives here, so a scrub re-renders the number and
 * the chart, never the page.
 */
const CollectionValueCard = memo(function CollectionValueCard({
  collectionValue,
  cardCount,
  valuesLoading,
  valuesFailed,
  valuesMessage,
  onRetry,
  snapshots,
  markers,
  shareable,
}: ValueCardProps) {
  const [chosen, setChosen] = useState<RangeId | null>(() => readStoredRange(storage(), CHART_ID));
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [sharing, setSharing] = useState(false);
  const today = snapshotDateInNewYork();
  const liveReady = !valuesLoading && !valuesFailed;

  const allPoints = useMemo(
    () => collectionPoints(snapshots.rows, { today, live: liveReady ? collectionValue : null, markers }),
    [snapshots.rows, today, liveReady, collectionValue, markers],
  );
  const available = useMemo(() => availableRanges(allPoints, today), [allPoints, today]);
  const range = pickRange(available, chosen);
  const points = useMemo(() => pointsInRange(allPoints, range, today), [allPoints, range, today]);
  const change = rangeChange(points);
  const firstDate = points[0]?.date ?? "";
  const tone = change && !change.up ? "down" : "up";
  const onScrub = useCallback((point: ChartPoint | null) => setScrub(point), []);

  const scrubChange: RangeChange | null = scrub && points.length ? rangeChange([points[0], scrub]) : null;
  const headline = scrub ? scrub.value : collectionValue;
  const loading = valuesLoading || snapshots.loading;
  const canChart = allPoints.length >= 2;
  const ariaLabel = chartSummary("Collection value", collectionValue, change, range, firstDate);
  const countText = `${cardCount} card${cardCount === 1 ? "" : "s"}`;

  function choose(next: RangeId) {
    setScrub(null);
    setChosen(next);
    writeStoredRange(storage(), CHART_ID, next);
  }

  async function share() {
    setSharing(true);
    try {
      await shareCollectionValue(range);
    } finally {
      setSharing(false);
    }
  }

  const shownChange = scrub ? scrubChange : change;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#18181B]"
      aria-label="Collection value"
    >
      <span
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#7C3AED]/15 blur-3xl dark:bg-[#7C3AED]/25"
        aria-hidden
      />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className={label}>Collection value</p>
          <div className="flex shrink-0 items-center gap-2">
            {shareable && canChart && liveReady ? (
              <button
                type="button"
                onClick={() => void share()}
                disabled={sharing}
                aria-label="Share your collection chart"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 text-zinc-700 transition-transform active:scale-95 disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:text-zinc-200"
              >
                <Share className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <AddCardLink />
          </div>
        </div>
        {valuesLoading ? (
          <>
            <span className="mt-1 block h-11 w-44 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-white/10" aria-hidden />
            <span className="sr-only">Loading collection value</span>
          </>
        ) : (
          <p
            className="mt-0.5 text-[40px] leading-[1.1] font-extrabold tracking-[-0.03em] tabular-nums"
            aria-live={scrub ? "off" : "polite"}
          >
            {valuesFailed ? "—" : money(headline)}
          </p>
        )}

        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
          {valuesLoading ? (
            <span className="block h-5 w-36 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" aria-hidden />
          ) : liveReady && shownChange ? (
            <>
              <span
                data-gain={shownChange.up ? "up" : "down"}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  shownChange.up
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                }`}
              >
                {shownChange.up ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                )}
                {changeAmount(shownChange)}
              </span>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {scrub ? `· ${shortDate(scrub.date)}` : rangePhrase(range, firstDate)}
              </span>
              {scrub?.marker ? (
                <span className="truncate text-xs font-semibold text-violet-700 dark:text-violet-300">{scrub.marker}</span>
              ) : null}
            </>
          ) : (
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{countText}</span>
          )}
        </div>
        {valuesFailed ? (
          <div className="mt-2 text-sm font-medium">
            <ValuesRetry onRetry={onRetry} detail={valuesMessage} />
          </div>
        ) : null}

        <div className="mt-3" style={{ minHeight: CHART_HEIGHT }}>
          {loading ? (
            <div className="skeleton-shimmer rounded-xl bg-zinc-100 dark:bg-white/5" style={{ height: CHART_HEIGHT }} aria-hidden />
          ) : !canChart ? (
            <ThinChart />
          ) : (
            <ValueChart
              points={points}
              ariaLabel={ariaLabel}
              tone={tone}
              curve="step"
              morphKey={range}
              onScrub={onScrub}
              showAth
              height={CHART_HEIGHT}
            />
          )}
        </div>

        {canChart && available.length > 1 && !loading ? (
          <div
            role="group"
            aria-label="Chart range"
            className="mt-3 grid gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[0.06]"
            style={{ gridTemplateColumns: `repeat(${available.length}, minmax(0, 1fr))` }}
          >
            {RANGES.filter((item) => available.includes(item.id)).map((item) => {
              const on = item.id === range;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(item.id)}
                  className={`hit-44 h-9 rounded-full text-xs font-semibold tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none ${
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
      </div>
    </section>
  );
});

/** Fewer than two saved days: a designed placeholder, never a flat or broken line. */
function ThinChart() {
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-zinc-50 px-6 text-center dark:bg-white/[0.03]"
      style={{ height: CHART_HEIGHT }}
    >
      <svg aria-hidden viewBox="0 0 300 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-6 h-20 w-full text-violet-500/25">
        <path d="M0 64 C60 60 90 50 130 52 S210 30 300 22" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="relative text-sm font-semibold">Your chart starts today</p>
      <p className="relative text-xs text-zinc-500 dark:text-zinc-400">Check back tomorrow to see it move.</p>
    </div>
  );
}

export function ValuesRetry({
  onRetry,
  detail,
}: {
  onRetry: () => void;
  detail?: string | null;
}) {
  return (
    <p>
      {detail ?? "Couldn't load values."}{" "}
      <button type="button" onClick={onRetry} className="hit-44 font-semibold underline">
        Retry
      </button>
    </p>
  );
}

function Tile({
  name,
  loading,
  children,
}: {
  name: string;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={tile}>
      <p className={label}>{name}</p>
      {loading ? (
        <>
          <div className="mt-2 h-6 w-20 animate-pulse rounded-md bg-zinc-200/80 dark:bg-white/10" aria-hidden />
          <div className="mt-2 h-3 w-24 max-w-full animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" aria-hidden />
          <span className="sr-only">Loading {name}</span>
        </>
      ) : (
        children
      )}
    </div>
  );
}

const value = "mt-1 truncate text-xl font-bold tracking-tight tabular-nums";
const sub = "mt-0.5 truncate text-xs font-medium tabular-nums";

function StatGrid({
  invested,
  paidCount,
  cardCount,
  profit,
  pricedCount,
  pricedInvested,
  withoutValueCount,
  onShowWithoutValue,
  best,
  loading,
  failed,
}: {
  invested: number;
  paidCount: number;
  cardCount: number;
  profit: number;
  pricedCount: number;
  pricedInvested: number;
  withoutValueCount: number;
  onShowWithoutValue?: () => void;
  best: BestCard<HeroCard> | null;
  loading: boolean;
  failed: boolean;
}) {
  const profitTone = profitAmountTone(pricedCount, profit);
  const toneClass = profitTone === "up" ? upText : profitTone === "down" ? downText : "";
  const profitPct = pricedInvested > 0 && pricedCount > 0 ? pct(profit / pricedInvested) : null;
  const withoutText = `${withoutValueCount} without a value yet`;

  return (
    <div className="grid grid-cols-2 gap-2" data-slot="collection-stats">
      <Tile name="Invested">
        <p className={value}>{investedAmountLabel(invested)}</p>
        <p className={`${sub} text-zinc-500 dark:text-zinc-400`}>
          {paidCount > 0 ? `${paidCount} of ${cardCount} with a price` : "Add what you paid"}
        </p>
      </Tile>
      <Tile name="Profit" loading={loading}>
        <p className={`${value} ${failed ? "" : toneClass}`}>{failed ? "—" : profitAmountLabel(pricedCount, profit)}</p>
        <p className={`${sub} ${failed || !profitPct ? "text-zinc-500 dark:text-zinc-400" : toneClass}`}>
          {failed ? "Values didn't load" : profitPct ? `${profitPct} on ${pricedCount} card${pricedCount === 1 ? "" : "s"}` : "Needs a price paid and a value"}
        </p>
      </Tile>
      <Tile name="Cards">
        <p className={value}>{cardCount}</p>
        {loading || failed ? (
          <p className={`${sub} text-zinc-500 dark:text-zinc-400`}>&nbsp;</p>
        ) : withoutValueCount > 0 && onShowWithoutValue ? (
          <button
            type="button"
            onClick={onShowWithoutValue}
            className="hit-44 mt-0.5 block max-w-full truncate text-left text-xs font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
          >
            {withoutText}
          </button>
        ) : (
          <p className={`${sub} text-zinc-500 dark:text-zinc-400`}>
            {withoutValueCount > 0 ? withoutText : "All have a value"}
          </p>
        )}
      </Tile>
      <Tile name="Best card" loading={loading}>
        {best ? (
          <Link
            href={`/cards/${best.card.id}`}
            className="-m-1 mt-0 flex min-h-11 items-center gap-2.5 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <CardThumb card={best.card.card} className="h-10 w-[30px] shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold" title={`${best.card.playerName}, ${formatPct(best.pct)}`}>
                {best.card.playerName}
              </span>
              <span className={`block truncate text-xs font-semibold tabular-nums ${best.gain >= 0 ? upText : downText}`}>
                {signedMoney(best.gain)}
              </span>
            </span>
          </Link>
        ) : (
          <>
            <p className={value}>—</p>
            <p className={`${sub} text-zinc-500 dark:text-zinc-400`}>{failed ? "Values didn't load" : "Needs a price paid and a value"}</p>
          </>
        )}
      </Tile>
    </div>
  );
}

function TopMovers({ movers }: { movers: Movers<HeroCard> }) {
  const basis = movers.basis === "history" ? "Past 30 days" : "Since you paid";
  return (
    <section aria-labelledby="top-movers-title" className={`${tile} p-0`}>
      <div className="px-3.5 pt-3.5 pb-1">
        <h2 id="top-movers-title" className="text-[15px] font-bold tracking-tight">
          Top movers in your collection
        </h2>
        {movers.rows.length ? <p className={`${label} mt-0.5`}>{basis}</p> : null}
      </div>
      {movers.rows.length ? (
        <ul className="pb-1.5">
          {movers.rows.map((row) => {
            const up = row.pct >= 0;
            return (
              <li key={row.card.id}>
                <Link
                  href={`/cards/${row.card.id}`}
                  className="flex min-h-14 items-center gap-3 px-3.5 py-2 outline-none hover:bg-zinc-50 focus-visible:bg-zinc-50 dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.03]"
                >
                  <CardThumb card={row.card.card} className="h-11 w-[33px] shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.card.playerName}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{cardTitle(row.card.card)}</span>
                  </span>
                  {row.points.length >= 2 ? (
                    <span className="w-12 shrink-0">
                      <ValueChart
                        variant="spark"
                        points={row.points}
                        tone={up ? "up" : "down"}
                        height={28}
                        ariaLabel={`${row.card.playerName}, ${up ? "up" : "down"} ${formatPct(row.pct, false)} past 30 days`}
                      />
                    </span>
                  ) : null}
                  <span
                    className={`w-16 shrink-0 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${
                      up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {formatPct(row.pct)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3.5 pt-1 pb-3.5 text-sm text-zinc-500 dark:text-zinc-400">
          Add what you paid on a card with a value to see your top movers.
        </p>
      )}
    </section>
  );
}
