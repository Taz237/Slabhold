"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Search, SlidersHorizontal, WalletCards, X } from "lucide-react";
import { outlineButton } from "@/components/button-styles";
import { CollectionGrid } from "@/components/collection-grid";
import { CollectionHeader } from "@/components/collection-header";
import { CollectionShareButton, LeaderboardSettingsButton } from "@/components/collection-actions";
import { CollectionSheet } from "@/components/collection-sheet";
import { CollectionTileActions } from "@/components/collection-tile-actions";
import { COLLECTION_LOAD_ERROR, useCollection } from "@/components/collection-provider";
import { ReadRetry } from "@/components/read-retry";
import { useSocial } from "@/components/social-provider";
import { CollectionLaneEmpty } from "@/components/collection-lane-empty";
import { FirstCardWelcome } from "@/components/first-card-welcome";
import { PortfolioHero } from "@/components/portfolio-hero";
import { shouldShowFirstCardWelcome } from "@/lib/collection/welcome";
import { CollectionSkeleton, EmptyState } from "@/components/status";
import { hasPaid } from "@/lib/format";
import { categoryLabel } from "@/lib/card-category";
import {
  matchesCategory,
  matchesFilter,
  matchesQuery,
  summarize,
} from "@/lib/portfolio";
import { type CardCategory, type PortfolioFilter, type SportsCard } from "@/lib/types";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import { sumPaid } from "@/lib/collection/profit-label";
import { costFilterShown, gridSortsFor, sortGridCards, type GridSort } from "@/lib/collection/grid";
import { leaderboardMinimums, type LeaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { trustedPublicTotals } from "@/lib/leaderboard/public-value";
import { useCardValues } from "@/lib/value/use-card-values";
import { cardValuesKey, type CollectionSeed } from "@/lib/collection/viewer-seed";
import { publicTogglePatch } from "@/lib/offers/open-to-offers";
import { afterFirstIdle } from "@/lib/ui/idle";
import { PartLoadFailed } from "@/components/part-load-failed";
import { lazyPart } from "@/lib/ui/lazy-part";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { pressTick } from "@/lib/ui/press-tick";

const LANES: { id: "all" | CardCategory | "wants"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flipping", label: categoryLabel("flipping") },
  { id: "pc", label: categoryLabel("pc") },
  { id: "wants", label: "Want list" },
];

/** Tap a filter to narrow the grid, tap it again for everything. */
const FILTERS: { id: Exclude<PortfolioFilter, "all">; label: string }[] = [
  { id: "held", label: "Held" },
  { id: "sold", label: "Sold" },
  { id: "profit", label: "Profit" },
  { id: "loss", label: "Loss" },
  { id: "novalue", label: "No value yet" },
];

/**
 * The Want list tab, in its own chunk with its Supabase reads, so the
 * collection's first load doesn't carry them. Fetched at the first idle
 * moment, so it is in hand before the tab is opened.
 */
const WantList = lazyPart(() => import("@/components/want-list").then((mod) => mod.WantList), null, {
  name: "want-list",
  failed: PartLoadFailed,
});

/** Tiles in a server-drawn first screen: a phone's two columns, a little past the fold. */
export const SEEDED_TILES = 12;

/**
 * How many tiles the first render draws. Only the server HTML stops at
 * SEEDED_TILES; the first client commit draws them all, as a plain update.
 * It used to add the rest a step at a time on idle callbacks inside a
 * transition, which could leave a card past the 12th (a new card with no
 * value yet sorts last by Value) off the grid.
 */
/** The filter that is on goes first, so it is never scrolled out of view. */
export function activeFirst<T extends { id: string }>(items: T[], active: string): T[] {
  return [...items.filter((item) => item.id === active), ...items.filter((item) => item.id !== active)];
}

const noSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function firstScreenTiles(serverDrawn: boolean): number {
  return serverDrawn ? SEEDED_TILES : Number.POSITIVE_INFINITY;
}

const chip =
  "hit-44 inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-[background-color,color,scale] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 motion-reduce:transition-none";
const chipOn = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950";
const chipOff =
  "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/10";

export function Dashboard({
  seed = null,
  minimums = leaderboardMinimums(),
  accountCreatedAt,
}: {
  seed?: CollectionSeed | null;
  minimums?: LeaderboardMinimums;
  accountCreatedAt?: string | null;
} = {}) {
  const { cards, ready, loadFailed, syncError, reload, updateCard } = useCollection();
  const { user } = useSocial();
  const toolsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<PortfolioFilter>("all");
  const [sort, setSort] = useState<GridSort>("value");
  const [lane, setLane] = useState<(typeof LANES)[number]["id"]>("all");
  /** Counts lane switches: the grid fades in again on each one, without remounting a tile. */
  const [laneTurn, setLaneTurn] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<SportsCard | null>(null);
  const summaryLane = lane === "wants" ? "all" : lane;

  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  // The server's read for this load: values, the chart's daily rows, and
  // per-card history, so the header and chart draw from the server HTML.
  const [seeded] = useState(() =>
    seed
      ? {
          values: seed.values
            ? { key: cardValuesKey(seed.cards.map((card) => card.id)), values: seed.values }
            : null,
          snapshots: { rows: seed.snapshots, loading: false },
          cardHistory: new Map(seed.cardHistory ?? []),
        }
      : null,
  );
  const {
    values,
    loading: valuesLoading,
    error: valuesError,
    errorMessage: valuesMessage,
    retry: retryValues,
  } = useCardValues(cardIds, seeded?.values);
  const valuesFailed = valuesError && !valuesLoading;

  const inLane = useMemo(
    () => cards.filter((card) => matchesCategory(card, summaryLane)),
    [cards, summaryLane],
  );
  const totals = useMemo(() => summarize(inLane, values), [inLane, values]);
  const collectionValue = useMemo(
    () => displayedCollectionTotal(inLane, values),
    [inLane, values],
  );
  const publicValued = useMemo(() => trustedPublicTotals(cards, values), [cards, values]);
  const publicCollection = useMemo(() => cards.some((card) => card.isPublic), [cards]);
  const profitTotal = totals.unrealizedProfit + totals.realizedProfit;
  const cardCount = inLane.length;
  const paidCount = inLane.filter((card) => hasPaid(card)).length;
  const investedAmount = sumPaid(inLane);
  const visible = useMemo(
    () =>
      sortGridCards(
        inLane.filter(
          (card) =>
            matchesQuery(card, query) && matchesFilter(card, filter, values),
        ),
        sort,
        values,
      ),
    [inLane, query, filter, sort, values],
  );

  // A filter or search that hides cards always says so above the grid, with
  // the count shown, so the header's total never disagrees silently.
  const narrowed = lane !== "wants" && visible.length < inLane.length;
  const narrowedBy = [
    filter !== "all" ? FILTERS.find((item) => item.id === filter)?.label : null,
    query.trim() ? `"${query.trim()}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // A server-drawn load lays out the first screen of tiles in its HTML, then
  // every tile in the commit right after hydration (see firstScreenTiles).
  const hydrated = useSyncExternalStore(noSubscribe, clientSnapshot, serverSnapshot);
  const gridRows = firstScreenTiles(Boolean(seed) && !hydrated);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => afterFirstIdle(() => void WantList.preload().catch(() => {})), []);

  function refreshCollection() {
    reload();
    retryValues();
  }

  function showWithoutValue() {
    setQuery("");
    setFilter("novalue");
    toolsRef.current?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function clearNarrowing() {
    setQuery("");
    setSearchOpen(false);
    setFilter("all");
  }

  function chooseLane(next: (typeof LANES)[number]["id"]) {
    if (next !== lane) {
      pressTick();
      setLaneTurn((turn) => turn + 1);
    }
    setLane(next);
    // All means every card: it also clears a filter or search left on.
    if (next === "all") clearNarrowing();
  }

  /** Left and Right move between the lane tabs, as a tab list should. */
  function onLaneKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = LANES.findIndex((item) => item.id === lane);
    const next = LANES[(index + (event.key === "ArrowRight" ? 1 : LANES.length - 1)) % LANES.length];
    chooseLane(next.id);
    event.currentTarget.querySelector<HTMLElement>(`[data-lane="${next.id}"]`)?.focus();
  }

  if (!ready) {
    return (
      <PullToRefresh onRefresh={refreshCollection}>
        <CollectionSkeleton />
      </PullToRefresh>
    );
  }

  // A failed load is never "no cards yet": the welcome would invite re-adding
  // cards that are already saved, and make duplicates.
  if (loadFailed && cards.length === 0) {
    return (
      <PullToRefresh onRefresh={refreshCollection}>
        <div className="space-y-4">
          <CollectionHeader />
          <ReadRetry title={COLLECTION_LOAD_ERROR} onRetry={reload} />
        </div>
      </PullToRefresh>
    );
  }

  const sorts = gridSortsFor(paidCount, sort);
  const sortLabel = sorts.find((item) => item.id === sort)?.label ?? "Value";
  const filters = FILTERS.filter(
    (item) =>
      (item.id !== "novalue" || filter === "novalue" || totals.withoutValueCount > 0) &&
      costFilterShown(item.id, paidCount, filter),
  );
  const filterLabel = filter !== "all" ? FILTERS.find((item) => item.id === filter)?.label : null;
  const showTools = cards.length > 0 && lane !== "wants";
  const searching = showTools && (searchOpen || Boolean(query));
  const laneLabel = LANES.find((item) => item.id === lane)?.label ?? "All";
  const leaderboard = (
    <LeaderboardSettingsButton
      minimums={minimums}
      valuedCards={publicValued.count}
      value={publicValued.value}
      publicCollection={publicCollection}
      ready={cards.length > 0 && !valuesLoading && !valuesFailed}
      accountCreatedAt={accountCreatedAt}
    />
  );

  return (
    <PullToRefresh onRefresh={refreshCollection}>
    <div className="space-y-4">
      {cards.length === 0 ? (
        <CollectionHeader actions={leaderboard} />
      ) : (
        <PortfolioHero
          cardCount={cardCount}
          collectionValue={collectionValue}
          profitTotal={profitTotal}
          pricedCount={totals.pricedCount}
          pricedInvested={totals.pricedInvested}
          investedAmount={investedAmount}
          paidCount={paidCount}
          withoutValueCount={totals.withoutValueCount}
          valuesLoading={valuesLoading}
          valuesFailed={valuesFailed}
          valuesMessage={valuesMessage}
          onRetry={retryValues}
          cards={inLane}
          values={values}
          onShowWithoutValue={showWithoutValue}
          shareable={Boolean(user?.username) && cards.some((card) => card.isPublic)}
          snapshots={seeded?.snapshots}
          cardHistory={seeded?.cardHistory}
          actions={(chart) => (
            <>
              {leaderboard}
              <CollectionShareButton chart={chart} />
            </>
          )}
        />
      )}
      {syncError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {syncError}{" "}
          <button type="button" onClick={() => void reload()} className="hit-44 font-semibold underline">
            Retry
          </button>
        </p>
      ) : null}
      {/* Sticky under the app header on a solid surface, so tiles never show through it. */}
      <div
        data-slot="collection-tools"
        className="sticky top-[var(--app-header-h)] z-20 -mx-4 border-b border-zinc-200/80 bg-[var(--background)] dark:border-white/[0.07]"
      >
      {/* One row: the lanes, then search and sort as icons. Search opens over the lanes. */}
      <div
        ref={toolsRef}
        className="flex scroll-mt-[calc(var(--app-header-h)+0.5rem)] items-center gap-1.5 px-4 py-2"
        data-no-pull
      >
        {searching ? (
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search your cards</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                setQuery("");
                setSearchOpen(false);
              }}
              placeholder="Player, set, year…"
              className="h-9 w-full rounded-full border border-zinc-200 bg-white pr-10 pl-9 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <button
              type="button"
              aria-label={query ? "Clear search" : "Close search"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (query) {
                  setQuery("");
                  searchRef.current?.focus();
                } else setSearchOpen(false);
              }}
              className="absolute top-1/2 right-0 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-zinc-500"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </label>
        ) : (
          <div
            className="lane-scroll -ml-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain pl-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Collection"
            onKeyDown={onLaneKey}
          >
            {LANES.map((item) => {
              const selected = lane === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  data-lane={item.id}
                  aria-selected={selected}
                  aria-controls="collection-lane-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => chooseLane(item.id)}
                  className={`${chip} tap ${selected ? chipOn : chipOff}`}
                >
                  {item.label}
                </button>
              );
            })}
            {/* Room after the last lane: Safari ignores a scroller's end padding. */}
            <span className="w-3 shrink-0" aria-hidden />
          </div>
        )}
        {showTools && !searching ? (
          <button
            type="button"
            aria-label="Search your cards"
            onClick={() => setSearchOpen(true)}
            className={`${chip} tap ${chipOff} w-9 justify-center px-0`}
          >
            <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
          </button>
        ) : null}
        {showTools ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Sort and filter. Sorted by ${sortLabel}${filterLabel ? `, showing ${filterLabel}` : ""}.`}
            onClick={() => setToolsOpen(true)}
            className={`${chip} tap relative ${chipOff} w-9 justify-center px-0`}
          >
            <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {filterLabel || sort !== "value" ? (
              <span aria-hidden data-slot="tools-dot" className="absolute top-1 right-1 h-2 w-2 rounded-full bg-violet-500 ring-2 ring-[var(--background)]" />
            ) : null}
          </button>
        ) : null}
      </div>
      </div>
      {toolsOpen ? (
        <CollectionSheet title="Sort and filter" onClose={() => setToolsOpen(false)}>
          <div role="group" aria-label="Sort" className="flex flex-wrap gap-2">
            {sorts.map((item) => {
              const selected = sort === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-sort={item.id}
                  aria-pressed={selected}
                  onClick={() => {
                    pressTick();
                    setSort(item.id);
                  }}
                  className={`${chip} tap h-11 px-4 text-sm ${selected ? chipOn : chipOff}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div role="group" aria-label="Filter" className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200 pt-4 pb-1 dark:border-white/10">
            {filters.map((item) => {
              const selected = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-filter={item.id}
                  aria-pressed={selected}
                  onClick={() => {
                    pressTick();
                    setFilter(selected ? "all" : item.id);
                  }}
                  className={`${chip} tap h-11 px-4 text-sm ${selected ? chipOn : chipOff}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </CollectionSheet>
      ) : null}
      <div
        id="collection-lane-panel"
        role="tabpanel"
        aria-label={laneLabel}
        className={`space-y-4 ${laneTurn === 0 ? "" : laneTurn % 2 ? "lane-in-a" : "lane-in-b"}`}
      >
      {narrowed ? (
        <div
          role="status"
          data-slot="grid-count"
          className="flex min-h-11 items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-300"
        >
          <p className="min-w-0 truncate tabular-nums">
            Showing {visible.length} of {inLane.length} {inLane.length === 1 ? "card" : "cards"}
            {narrowedBy ? <span className="text-zinc-500"> · {narrowedBy}</span> : null}
          </p>
          <button
            type="button"
            onClick={clearNarrowing}
            className="hit-44 shrink-0 font-semibold text-violet-700 dark:text-[#A78BFA]"
          >
            Show all
          </button>
        </div>
      ) : null}

      {cards.length === 0 ? (
        lane === "wants" ? (
          <WantList />
        ) : lane === "flipping" || lane === "pc" ? (
          <CollectionLaneEmpty lane={lane} />
        ) : shouldShowFirstCardWelcome({ cardCount: cards.length, ready, syncError: loadFailed ? syncError : null }) ? (
          <FirstCardWelcome />
        ) : null
      ) : lane === "wants" ? (
        <WantList />
      ) : visible.length === 0 ? (
        inLane.length === 0 && (lane === "flipping" || lane === "pc") ? (
          <CollectionLaneEmpty lane={lane} onShowAll={() => chooseLane("all")} />
        ) : (
        <EmptyState
          icon={<WalletCards className="h-5 w-5" />}
          title="No cards match"
          detail="Nothing in this tab matches that search or filter."
        >
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
              setFilter("all");
            }}
            className={outlineButton}
          >
            Clear filters
          </button>
        </EmptyState>
        )
      ) : (
        <CollectionGrid
          cards={visible.slice(0, gridRows)}
          values={values}
          valuesLoading={valuesLoading}
          valuesFailed={valuesFailed}
          onVisibility={(card, isPublic) => updateCard(card.id, publicTogglePatch(card, isPublic))}
          onActions={setActionsFor}
        />
      )}
      </div>
      {actionsFor ? (
        <CollectionTileActions
          // The sheet reads the card as it is now, so a move or a public switch shows at once.
          card={cards.find((card) => card.id === actionsFor.id) ?? actionsFor}
          onClose={() => setActionsFor(null)}
        />
      ) : null}
    </div>
    </PullToRefresh>
  );
}
