"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Layers, Trophy } from "lucide-react";
import { AddCardLink } from "@/components/add-card-link";
import type { ChartShare } from "@/components/collection-actions";
import { MoveArrow, TopMovers, muted, type HeroCard } from "@/components/collection-movers";
import { ShapedCardThumb } from "@/components/card-thumb";
import { ValueChart, type ChartPoint } from "@/components/charts/value-chart";
import { athIndex, dayLabel } from "@/lib/chart/geometry";
import {
  availableRanges,
  chartReady,
  formatPct,
  pctTone,
  pickRange,
  pointsInRange,
  rangePhrase,
  RANGES,
  readStoredRange,
  writeStoredRange,
  type ChangeTone,
  type RangeId,
} from "@/lib/chart/range";
import { MOVE_PILL, TONE_CLASS, collectionMinSpan } from "@/lib/chart/theme";
import {
  cardDaysForCollection,
  indexPoints,
  marketMove,
  performanceSeries,
  type IndexPoint,
  type MarketMove,
  type PerformancePoint,
} from "@/lib/collection/performance";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import {
  useCardDaySnapshots,
  useCardValueHistory,
  useCollectionSnapshots,
  type CardDays,
  type CardHistory,
  type CollectionSnapshots,
} from "@/lib/collection/use-value-history";
import {
  addedMarkers,
  bestCard,
  collectionPoints,
  paidMovers,
  topCardByValue,
  weekMovers,
  type BestCard,
} from "@/lib/collection/value-series";
import { hasPaid, isSold, money, signedMoney } from "@/lib/format";
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
  /** Cards in the lane, for markers, Best card and Top movers. */
  cards?: SportsCard[];
  values?: Map<string, CardValueResult>;
  /** Opens the cards without a value yet. */
  onShowWithoutValue?: () => void;
  /** False for a private collection: the chart image is not offered to share. */
  shareable?: boolean;
  /**
   * Controls in the hero's top row, before Add a card (share, the leaderboard
   * switch). Handed the chart share when the chart can be shared, else null.
   */
  actions?: (chart: ChartShare | null) => ReactNode;
  /** Tests pass saved days in. The app reads them. */
  snapshots?: CollectionSnapshots;
  /** Tests pass per-card days in. The app reads them. */
  cardHistory?: CardHistory;
  /** Tests pass saved per-card daily values in. The app reads them. */
  cardDays?: CardDays;
};

/** The share code, loaded on the tap. An object so tests can stand in for it. */
export const collectionShare = {
  load: () => import("@/components/collection-value-share"),
};

const CHART_ID = "collection";
const CHART_HEIGHT = 148;
const NO_CARDS: SportsCard[] = [];
const NO_VALUES = new Map<string, CardValueResult>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const pulse = "skeleton-shimmer";
type CountUp = typeof import("@/components/hero-count-up");
let countUp: CountUp | null = null;
let countUpLoad: Promise<unknown> | null = null;
/** Fetched as soon as the hero loads (and on mount); used only when values land. */
function loadCountUp() {
  countUpLoad ??= import("@/components/hero-count-up").then(
    (module) => (countUp = module),
    () => (countUpLoad = null),
  );
}
if (typeof window !== "undefined") loadCountUp();
const press =
  "outline-none transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none";
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The New York day a sold card left, when known. */
function soldDay(card: SportsCard): string | null {
  if (card.soldAt) {
    const stamp = new Date(card.soldAt);
    if (!Number.isNaN(stamp.getTime())) return snapshotDateInNewYork(stamp);
  }
  return card.sellDate && /^\d{4}-\d{2}-\d{2}/.test(card.sellDate) ? card.sellDate.slice(0, 10) : null;
}

/** Collection value and chart, Cards and Best card, then Top movers. */
export function PortfolioHero(props: PortfolioHeroProps) {
  // Invested and Profit stay on the props (the dashboard passes them), unshown.
  const {
    cardCount,
    collectionValue,
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
        createdAt: card.createdAt,
        card,
      })),
    [cards, values],
  );
  const pick = useMemo<StatPick | null>(() => {
    if (valuesLoading || valuesFailed) return null;
    const best = bestCard(movers);
    if (best && best.gain > 0) return { kind: "best", best };
    const top = topCardByValue(movers);
    return top ? { kind: "top", card: top } : null;
  }, [movers, valuesLoading, valuesFailed]);
  const today = snapshotDateInNewYork();
  const moversWeek = useMemo(() => weekMovers(movers, history, today), [movers, history, today]);
  const moversPaid = useMemo(() => paidMovers(movers), [movers]);
  const markers = useMemo(() => addedMarkers(cards), [cards]);
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const readDays = useCardDaySnapshots(cardIds, cards.length > 0 && props.cardDays === undefined);
  const days = props.cardDays ?? readDays;
  const liveReady = !valuesLoading && !valuesFailed;
  const perf = useMemo(
    () =>
      performanceSeries(
        cardDaysForCollection(
          days.rows,
          cards.map((card) => ({
            id: card.id,
            sold: isSold(card),
            soldOn: soldDay(card),
            live: isSold(card) ? null : shownCardValue(card, values.get(card.id)),
          })),
          { today, live: liveReady },
        ),
      ),
    [days.rows, cards, values, today, liveReady],
  );

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
        actions={props.actions}
        perf={perf}
        perfLoading={days.loading}
      />
      <StatRow
        cardCount={cardCount}
        withoutValueCount={withoutValueCount}
        onShowWithoutValue={onShowWithoutValue}
        pick={pick}
        loading={valuesLoading}
        failed={valuesFailed}
      />
      {!valuesLoading && !valuesFailed && cards.length > 0 ? <TopMovers week={moversWeek} paid={moversPaid} /> : null}
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
  actions?: (chart: ChartShare | null) => ReactNode;
  /** Market-only daily performance, oldest first. */
  perf: PerformancePoint[];
  perfLoading: boolean;
};

export type ChartMode = "performance" | "value";

const MODE_KEY = "slabhold:chart-mode:collection";
/** The toggle shows the unit each mode's axis reads in; the name is for screen readers. */
const MODES: { id: ChartMode; label: string; glyph: string }[] = [
  { id: "performance", label: "Performance", glyph: "%" },
  { id: "value", label: "Value", glyph: "$" },
];
const RANGE_LABEL: Record<RangeId, string> = { "7d": "1W", "30d": "1M", "90d": "3M", "1y": "1Y", all: "All" };
/** Smallest y span in Performance: 2 points of return, so a quiet week looks quiet. */
const PERF_MIN_SPAN = 2;
const NOTE_MS = 4000;

function readStoredMode(store: Storage | null): ChartMode {
  try {
    return store?.getItem(MODE_KEY) === "value" ? "value" : "performance";
  } catch {
    return "performance";
  }
}

function writeStoredMode(store: Storage | null, mode: ChartMode) {
  try {
    store?.setItem(MODE_KEY, mode);
  } catch {
    // Private mode or blocked storage. The choice still holds for this visit.
  }
}

/**
 * Up, down, or flat when it reads $0.00 and 0.0%. The % leads: it is the
 * Performance line. Dollars and % can disagree when a gain on a small
 * early base is followed by a loss on a bigger one; the line wins.
 */
export function moveTone(move: MarketMove | null): ChangeTone {
  if (!move) return "flat";
  if (move.delta === 0 && pctTone(move.pct) === "flat") return "flat";
  const pctSide = pctTone(move.pct);
  if (pctSide !== "flat") return pctSide;
  return move.delta > 0 ? "up" : "down";
}

/** "+$12.40 (+3.1%)", or the dollars alone when no % is shown. */
function moveAmount(move: MarketMove): string {
  const amount = move.delta === 0 ? money(0) : signedMoney(move.delta);
  return move.pct == null ? amount : `${amount} (${formatPct(move.pct)})`;
}

function moveSummary(value: number, move: MarketMove | null, range: RangeId, firstDate: string): string {
  const head = `Collection value ${money(value)}`;
  if (!move) return `${head}, not enough history yet for a market move`;
  const phrase = rangePhrase(range, firstDate);
  const tone = moveTone(move);
  if (tone === "flat") return `${head}, market move flat ${phrase}`;
  const amount = move.pct == null ? money(Math.abs(move.delta)) : formatPct(move.pct, false);
  return `${head}, market move ${tone} ${amount} ${phrase}`;
}

/** The one hero. Scrub state lives here, so a scrub re-renders the number and the chart, never the page. */
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
  actions,
  perf,
  perfLoading,
}: ValueCardProps) {
  const [chosen, setChosen] = useState<RangeId | null>(() => readStoredRange(storage(), CHART_ID));
  const [mode, setMode] = useState<ChartMode>(() => readStoredMode(storage()));
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [note, setNote] = useState<{ text: string; date: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const today = snapshotDateInNewYork();
  const liveReady = !valuesLoading && !valuesFailed;
  const headlineRef = useRef<HTMLParagraphElement>(null);
  const counting = useRef<(() => void) | undefined>(undefined);
  const wasLoading = useRef(valuesLoading);
  const lastShown = useRef<number | null>(null);
  const lastScrub = useRef<ChartPoint | null>(null);
  const modeRef = useRef(mode);
  useEffect(loadCountUp, []);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const allPoints = useMemo(
    () => collectionPoints(snapshots.rows, { today, live: liveReady ? collectionValue : null, markers }),
    [snapshots.rows, today, liveReady, collectionValue, markers],
  );
  const available = useMemo(() => availableRanges(allPoints, today), [allPoints, today]);
  const range = pickRange(available, chosen);
  const points = useMemo(() => pointsInRange(allPoints, range, today), [allPoints, range, today]);
  const perfPoints = useMemo(() => pointsInRange(perf, range, today), [perf, range, today]);
  const indexed = useMemo<IndexPoint[]>(() => indexPoints(perfPoints, markers), [perfPoints, markers]);
  const move = useMemo(() => marketMove(perfPoints), [perfPoints]);
  const firstDate = points[0]?.date ?? "";
  const latest = points[points.length - 1]?.value ?? collectionValue;
  const minSpan = collectionMinSpan(latest);
  const performance = mode === "performance";
  // ATH (Value only) when not the latest point and 1%+ above it.
  const ath = athIndex(points);
  const showAth = !performance && !scrub && ath >= 0 && ath < points.length - 1 && points[ath].value >= latest * 1.01;
  const valueOn = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const point of perfPoints) byDate.set(point.date, point.value);
    for (const point of points) byDate.set(point.date, point.value);
    return byDate;
  }, [perfPoints, points]);

  const onScrub = useCallback((point: ChartPoint | null) => {
    counting.current?.();
    if (point) {
      lastScrub.current = point;
      setNote(null);
    } else {
      // Let go on a day a card was added (Value): say what was added.
      const last = lastScrub.current;
      lastScrub.current = null;
      if (last?.marker && modeRef.current === "value") setNote({ text: last.marker, date: last.date });
    }
    setScrub(point);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  const scrubMove: MarketMove | null = scrub
    ? (marketMove(perfPoints.filter((point) => point.date <= scrub.date)) ??
      (move ? { delta: 0, pct: 0, up: true } : null))
    : null;
  const headline = scrub ? (valueOn.get(scrub.date) ?? collectionValue) : collectionValue;
  const loading = valuesLoading || snapshots.loading || (performance && perfLoading);
  const canChart = chartReady(allPoints);
  const perfReady = move != null && indexed.length >= 2;
  const ariaLabel = moveSummary(collectionValue, move, range, firstDate);
  const countText = `${cardCount} card${cardCount === 1 ? "" : "s"}`;

  // The count-up, as values land: from the total this screen last showed (after adding a card, a
  // $2.25 card counts +$2.25), else the last saved day's total. Never $0 and never the range's
  // start, which made one add look like a month of gains. Nothing to count from: it simply shows.
  // Skipped if its chunk is not in yet.
  const previousDay = useMemo(() => {
    let found: { date: string; value: number } | null = null;
    for (const row of snapshots.rows) {
      if (row.snapshot_date < today && row.value > 0 && (!found || row.snapshot_date > found.date)) found = { date: row.snapshot_date, value: row.value };
    }
    return found?.value ?? null;
  }, [snapshots.rows, today]);
  useClientLayoutEffect(() => {
    const was = wasLoading.current;
    wasLoading.current = valuesLoading;
    const node = headlineRef.current;
    if (!was || valuesLoading || valuesFailed || !node || !countUp) return;
    const countFrom = lastShown.current ?? previousDay;
    if (countFrom == null || countFrom <= 0 || countFrom === collectionValue) return;
    const cancel = countUp.heroCountUp(node, countFrom, collectionValue);
    counting.current = cancel ?? undefined;
    return cancel ?? undefined;
  }, [valuesLoading]);
  // The total on screen once values settle: the next count starts from it.
  useEffect(() => {
    if (!valuesLoading && !valuesFailed && collectionValue > 0) lastShown.current = collectionValue;
  }, [valuesLoading, valuesFailed, collectionValue]);

  function choose(next: RangeId) {
    setScrub(null);
    setNote(null);
    setChosen(next);
    writeStoredRange(storage(), CHART_ID, next);
  }

  function chooseMode(next: ChartMode) {
    setScrub(null);
    setNote(null);
    setMode(next);
    writeStoredMode(storage(), next);
  }

  async function share() {
    setSharing(true);
    setShareFailed(false);
    try {
      let shareCode: Awaited<ReturnType<typeof collectionShare.load>>;
      try {
        shareCode = await collectionShare.load();
      } catch (error) {
        // A chunk that would not load (deploy skew, a flaky network). The next tap loads again.
        console.warn("[collection-share]", error instanceof Error ? error.message : String(error));
        setShareFailed(true);
        return;
      }
      await shareCode.shareCollectionValue(range);
    } finally {
      setSharing(false);
    }
  }

  const shownMove = scrub ? scrubMove : move;
  const shownTone = moveTone(shownMove);
  const changeLoading = valuesLoading || perfLoading;

  const chartShare: ChartShare | null =
    shareable && canChart && liveReady ? { share: () => void share(), sharing, failed: shareFailed } : null;
  const ranges = canChart && available.length > 1 && !loading ? RANGES.filter((item) => available.includes(item.id)) : [];
  const showModes = canChart && !valuesLoading && !snapshots.loading;

  return (
    <section className="collection-hero relative" aria-label="Collection value">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h1 className={`text-sm font-medium ${muted}`}>Collection</h1>
        <div className="flex items-center gap-2">
          {actions?.(chartShare)}
          <AddCardLink />
        </div>
      </div>
      {valuesLoading ? (
        <>
          <span className="mt-1 block h-[3.25rem] w-48 skeleton-shimmer rounded-lg" aria-hidden />
          <span className="sr-only">Loading collection value</span>
        </>
      ) : (
        <p
          ref={headlineRef}
          data-slot="hero-value"
          className="mt-1 text-[2.75rem] leading-[3.25rem] font-semibold tracking-[-0.035em] tabular-nums max-[359px]:text-[2.375rem]"
          aria-live={scrub ? "off" : "polite"}
        >
          {valuesFailed ? "—" : money(headline)}
        </p>
      )}

      {/* One fixed line: scrubbing never moves the chart. */}
      <div className="mt-1 flex h-6 items-center gap-2 overflow-hidden whitespace-nowrap" data-slot="hero-change">
        {changeLoading && !valuesFailed ? (
          <span className={`block h-5 w-36 rounded-full ${pulse}`} aria-hidden />
        ) : liveReady && canChart && shownMove ? (
          <>
            <span
              data-gain={shownTone}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${MOVE_PILL[shownTone]}`}
            >
              <MoveArrow tone={shownTone} />
              {moveAmount(shownMove)}
            </span>
            {scrub ? (
              <span className={`truncate text-xs font-medium ${muted}`}>· {dayLabel(scrub.date)}</span>
            ) : (
              <span className="sr-only">market move</span>
            )}
          </>
        ) : liveReady && canChart ? (
          <span className={`text-xs font-medium ${muted}`} data-slot="thin-history">
            Not enough history yet{scrub ? ` · ${dayLabel(scrub.date)}` : ""}
          </span>
        ) : (
          <span className={`text-xs font-medium ${muted}`}>{countText}</span>
        )}
      </div>
      {valuesFailed ? (
        <div className="mt-2 text-sm font-medium">
          <ValuesRetry onRetry={onRetry} detail={valuesMessage} />
        </div>
      ) : null}

      {/* Edge to edge on a phone: the line runs off the left of the screen. */}
      <div className="hero-chart relative mt-3 max-sm:-mr-2 max-sm:-ml-4" style={{ minHeight: CHART_HEIGHT }}>
        {loading ? (
          <div className="skeleton-shimmer rounded-xl bg-zinc-100 max-sm:mr-2 max-sm:ml-4 dark:bg-white/5" style={{ height: CHART_HEIGHT }} aria-hidden />
        ) : !canChart ? (
          <ThinChart />
        ) : performance && !perfReady ? (
          <ThinChart title="Not enough history yet" detail="Price moves show here once your cards have a few days of sold prices." />
        ) : (
          <ValueChart
            points={performance ? indexed : points}
            ariaLabel={ariaLabel}
            tone="brand"
            curve="monotone"
            morphKey={`${mode}-${range}`}
            onScrub={onScrub}
            showAth={showAth}
            minSpan={performance ? PERF_MIN_SPAN : minSpan}
            format={performance ? "percent" : "money"}
            markerDots={!performance}
            lineWidth={2}
            faintGrid
            tooltip="date"
            height={CHART_HEIGHT}
            tickInset={16}
          />
        )}
        {note ? (
          <p
            role="status"
            data-slot="add-note"
            className="pointer-events-none absolute top-0 left-0 inline-flex h-7 max-w-full items-center truncate rounded-full bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm max-sm:left-4 dark:bg-zinc-100 dark:text-zinc-950"
          >
            {note.text} · {dayLabel(note.date)}
          </p>
        ) : null}
      </div>

      {/* Range on the left, the chart's unit on the right. The row holds its height, so nothing shifts as it fills. */}
      <div className="mt-1 flex min-h-9 items-center justify-between gap-2" data-slot="hero-controls">
        {ranges.length ? (
          <div role="group" aria-label="Chart range" data-slot="range-track" className="-ml-2 flex min-w-0 items-center">
            {ranges.map((item) => {
              const on = item.id === range;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={item.id === "all" ? "All time" : item.phrase.replace(/^p/, "P")}
                  onClick={() => choose(item.id)}
                  className={`hit-44 h-9 rounded-full text-xs font-semibold tabular-nums relative min-w-10 px-2 font-mono ${press} ${
                    on
                      ? "text-zinc-950 dark:text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
                  }`}
                >
                  {RANGE_LABEL[item.id]}
                  {on ? (
                    <span
                      aria-hidden
                      data-range-dot=""
                      className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current ${TONE_CLASS.brand}`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        {showModes ? (
          <div
            role="group"
            aria-label="Chart mode"
            data-slot="mode-toggle"
            className="inline-flex shrink-0 rounded-full bg-zinc-950/[0.05] p-0.5 dark:bg-white/[0.06]"
          >
            {MODES.map((item) => {
              const on = item.id === mode;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => chooseMode(item.id)}
                  className={`hit-44 h-7 w-9 rounded-full font-mono text-xs font-semibold ${press} ${
                    on
                      ? "bg-white text-zinc-950 shadow-sm dark:bg-white/[0.14] dark:text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
                  }`}
                >
                  <span aria-hidden>{item.glyph}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
});

/** Under two saved days (or too little to measure): a placeholder, never a flat line. */
function ThinChart({
  title = "Your chart starts today",
  detail = "Check back tomorrow to see it move.",
}: {
  title?: string;
  detail?: string;
}) {

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-zinc-50 px-6 py-4 text-center max-sm:mr-2 max-sm:ml-4 dark:bg-white/[0.03]"
      style={{ minHeight: CHART_HEIGHT }}
    >
      <svg
        aria-hidden
        viewBox="0 0 300 80"
        preserveAspectRatio="none"
        className="absolute inset-x-4 bottom-6 h-20 w-[calc(100%-2rem)] overflow-visible text-violet-600 dark:text-violet-400"
      >
        <path
          d="M0 64 C60 60 90 50 130 52 S210 30 300 22"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth="2"
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
        />
        <path d="M300 22h0" stroke="currentColor" strokeWidth={8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="relative text-sm font-semibold">{title}</p>
      <p className={`relative text-xs ${muted}`}>{detail}</p>
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

const chip =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-zinc-950/[0.07] bg-white px-3.5 text-13 dark:border-white/[0.08] dark:bg-white/[0.04]";
const chipIcon = "h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400";

type StatPick = { kind: "best"; best: BestCard<HeroCard> } | { kind: "top"; card: HeroCard };

/**
 * One slim strip: the card count, the Best (or Top) card with its real
 * thumbnail and number, and the shortcut to cards without a value yet. It
 * scrolls sideways when all three don't fit. Brand purple with ▲ on a gain,
 * never green.
 */
function StatRow({
  cardCount,
  withoutValueCount,
  onShowWithoutValue,
  pick,
  loading,
  failed,
}: {
  cardCount: number;
  withoutValueCount: number;
  onShowWithoutValue?: () => void;
  pick: StatPick | null;
  loading: boolean;
  failed: boolean;
}) {
  const withoutText = `${withoutValueCount} without a value yet`;
  const name = pick?.kind === "top" ? "Top card" : "Best card";
  const card = pick ? (pick.kind === "best" ? pick.best.card : pick.card) : null;
  const showWithout = !loading && !failed && withoutValueCount > 0;

  return (
    <div
      data-slot="collection-stats"
      data-no-pull
      // `relative`: keeps the chips' screen-reader words inside this row, so they never widen the page.
      className="relative -mx-4 flex items-center gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <p className={chip} data-stat-tile="Cards">
        <Layers className={chipIcon} strokeWidth={1.5} aria-hidden />
        <span>
          <span className="font-mono font-semibold tabular-nums">{cardCount.toLocaleString("en-US")}</span>{" "}
          <span className={muted}>{cardCount === 1 ? "card" : "cards"}</span>
        </span>
      </p>
      {loading ? (
        <p className={chip} data-stat-tile={name}>
          <Trophy className={chipIcon} strokeWidth={1.5} aria-hidden />
          <span className={`h-3 w-24 rounded-full ${pulse}`} aria-hidden />
          <span className="sr-only">Loading {name}</span>
        </p>
      ) : pick && card ? (
        <Link
          href={`/cards/${card.card.id}`}
          data-stat-tile={name}
          title={pick.kind === "best" ? "Best card, since you paid" : "Top card"}
          className={`${chip} tap pl-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-600`}
        >
          <Trophy className={chipIcon} strokeWidth={1.5} aria-hidden />
          <span className="sr-only">{name}</span>
          <ShapedCardThumb card={card.card} className="h-8 w-6 shrink-0 rounded" landscapeClassName="h-6 w-8 shrink-0 rounded" />
          <span className="max-w-32 truncate font-medium">{card.playerName}</span>
          {pick.kind === "best" ? (
            <>
              <span
                data-gain="up"
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs leading-4 font-semibold tabular-nums ${MOVE_PILL.up}`}
              >
                <MoveArrow tone="up" />
                {signedMoney(pick.best.gain)}
              </span>
              <span className="sr-only">since you paid</span>
            </>
          ) : (
            <span className="font-mono font-semibold tabular-nums">{money(pick.card.value ?? 0)}</span>
          )}
        </Link>
      ) : null}
      {showWithout && onShowWithoutValue ? (
        <button
          type="button"
          onClick={onShowWithoutValue}
          className={`${chip} tap border-violet-500/20 bg-violet-500/10 pr-2 font-medium text-violet-700 hover:bg-violet-500/15 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300 ${press}`}
        >
          <span>{withoutText}</span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
        </button>
      ) : showWithout ? (
        <p className={`${chip} ${muted}`}>{withoutText}</p>
      ) : null}
      {/* Room after the last chip: Safari ignores a scroller's end padding. */}
      <span className="w-2 shrink-0" aria-hidden />
    </div>
  );
}
