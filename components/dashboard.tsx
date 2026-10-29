"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Search, WalletCards, X } from "lucide-react";
import { outlineButton } from "@/components/button-styles";
import { CollectionGrid } from "@/components/collection-grid";
import { CollectionHeader } from "@/components/collection-header";
import { useCollection } from "@/components/collection-provider";
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
import { type CardCategory, type PortfolioFilter } from "@/lib/types";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import { sumPaid } from "@/lib/collection/profit-label";
import { GRID_SORTS, sortGridCards, type GridSort } from "@/lib/collection/grid";
import { useCardValues } from "@/lib/value/use-card-values";
import { publicTogglePatch } from "@/lib/offers/open-to-offers";
import { WantList } from "@/components/want-list";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ShareCollectionCard } from "@/components/invite/share-collection-card";

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
];

const chip =
  "hit-44 inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-violet-600";
const chipOn = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950";
const chipOff =
  "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/10";

export function Dashboard() {
  const { cards, ready, syncError, reload, updateCard } = useCollection();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<PortfolioFilter>("all");
  const [sort, setSort] = useState<GridSort>("value");
  const [lane, setLane] = useState<(typeof LANES)[number]["id"]>("all");
  const summaryLane = lane === "wants" ? "all" : lane;

  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const {
    values,
    loading: valuesLoading,
    error: valuesError,
    errorMessage: valuesMessage,
    retry: retryValues,
  } = useCardValues(cardIds);
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

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function refreshCollection() {
    reload();
    retryValues();
  }

  function cycleSort() {
    const index = GRID_SORTS.findIndex((item) => item.id === sort);
    setSort(GRID_SORTS[(index + 1) % GRID_SORTS.length].id);
  }

  if (!ready) {
    return (
      <PullToRefresh onRefresh={refreshCollection}>
        <CollectionSkeleton />
      </PullToRefresh>
    );
  }

  const sortLabel = GRID_SORTS.find((item) => item.id === sort)?.label ?? "Value";
  const showTools = cards.length > 0 && lane !== "wants";

  return (
    <PullToRefresh onRefresh={refreshCollection}>
    <div className="space-y-4">
      {cards.length === 0 ? (
        <CollectionHeader />
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
        />
      )}
      {cards.length > 0 ? <ShareCollectionCard /> : null}
      {syncError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{syncError}</p>
      ) : null}
      <div
        className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        data-no-pull
      >
        {showTools ? (
          searchOpen || query ? (
            <label className="relative shrink-0">
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
                className="w-48 rounded-full border border-zinc-200 bg-white py-1.5 pr-8 pl-9 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-0 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-zinc-500"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </label>
          ) : (
            <button
              type="button"
              aria-label="Search your cards"
              onClick={() => setSearchOpen(true)}
              className={`${chip} ${chipOff} w-9 justify-center px-0`}
            >
              <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
            </button>
          )
        ) : null}
        <div className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Collection">
          {LANES.map((item) => {
            const selected = lane === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setLane(item.id)}
                className={`${chip} ${selected ? chipOn : chipOff}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {showTools ? (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-zinc-200 dark:bg-white/10" aria-hidden />
            <button
              type="button"
              onClick={cycleSort}
              aria-label={`Sort by ${sortLabel}. Tap to change.`}
              className={`${chip} ${chipOff}`}
            >
              <ArrowDownUp className="h-3.5 w-3.5" aria-hidden />
              {sortLabel}
            </button>
            {FILTERS.map((item) => {
              const selected = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(selected ? "all" : item.id)}
                  className={`${chip} ${selected ? chipOn : chipOff}`}
                >
                  {item.label}
                </button>
              );
            })}
          </>
        ) : null}
      </div>

      {cards.length === 0 ? (
        lane === "wants" ? (
          <WantList />
        ) : syncError ? null : lane === "flipping" || lane === "pc" ? (
          <CollectionLaneEmpty lane={lane} />
        ) : shouldShowFirstCardWelcome({ cardCount: cards.length, ready, syncError }) ? (
          <FirstCardWelcome />
        ) : null
      ) : lane === "wants" ? (
        <WantList />
      ) : visible.length === 0 ? (
        inLane.length === 0 && (lane === "flipping" || lane === "pc") ? (
          <CollectionLaneEmpty lane={lane} onShowAll={() => setLane("all")} />
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
          cards={visible}
          values={values}
          valuesLoading={valuesLoading}
          valuesFailed={valuesFailed}
          onVisibility={(card, isPublic) => updateCard(card.id, publicTogglePatch(card, isPublic))}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
