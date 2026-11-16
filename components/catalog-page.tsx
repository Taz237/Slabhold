"use client";

import { backLinkClick } from "@/components/nav-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { CardTile, tileFocusRing } from "@/components/card-tile";
import { Logo } from "@/components/logo";
import {
  FreshnessDot,
  MoverTile,
  RAIL_LIST,
  RAIL_PREFETCH_TILES,
  useTapThroughDrift,
} from "@/components/moving-today";
import { useReducedMotion } from "@/components/timeline-ui";
import {
  appendCatalogTiles,
  CATALOG_API,
  CATALOG_PATH,
  CATALOG_SORTS,
  CATALOG_SPORTS,
  catalogFiltersActive,
  catalogNoMatchText,
  catalogSearch,
  catalogTileName,
  cleanCatalogSearch,
  DEFAULT_CATALOG_FILTERS,
  parseCatalogFilters,
  sameCatalogFilters,
  type CatalogFilters,
  type CatalogPage,
  type CatalogSort,
  type CatalogSport,
  type CatalogTile,
} from "@/lib/public-catalog/query";
import { MOVING_RAIL_COUNT } from "@/lib/moving-today/rail";
import type { MovingTodayPayload, MovingTodaySale } from "@/lib/moving-today/types";
import type { TileCard } from "@/components/card-tile";

/** First paint: tiles fade and rise in, 30ms apart. */
const STAGGER_MS = 30;
const STAGGER_TILES = 8;
const ENTER = "motion-safe:animate-[tile-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
/** A filter switch crossfades the grid instead of replaying the stagger. */
const SWAP = "motion-safe:animate-[lightbox-fade_160ms_ease-out_both]";

/** The first two rows prefetch their card page. Tiles past them skip paint until scrolled near. */
const PAINTED_TILES = 4;
const OFFSCREEN_TILE = "[content-visibility:auto] [contain-intrinsic-size:auto_180px_auto_340px]";

/** Start the next read this far before the end of the grid, so scrolling never waits. */
const LOAD_AHEAD = "1200px 0px";
/** Typing waits this long before it reads. */
const SEARCH_DEBOUNCE_MS = 300;

/** The same translucent blur as the app header and Home tabs. */
const CHROME = "glass bg-[var(--chrome-bg)] backdrop-blur-xl backdrop-saturate-150";

const GRID = "grid grid-cols-2 gap-y-2 px-1 pb-8 sm:grid-cols-3 lg:grid-cols-4";

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]";

const CHIP =
  "min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-150";
const CHIP_ON = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950";
const CHIP_OFF = "bg-zinc-900/[0.05] text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300";

function tileCard(tile: CatalogTile): TileCard {
  return {
    id: tile.id,
    playerName: tile.player,
    year: 0,
    yearLabel: tile.yearLabel,
    setBrand: tile.setName,
    accent: tile.accent,
    photoDataUrl: tile.imageUrl,
    grade: tile.grade,
    grader: tile.grader,
    conditionType: tile.conditionType ?? undefined,
    isRookie: tile.isRookie,
  };
}

/** On Back the router can redraw from older props, but the URL kept the filters. */
function filtersNow(fallback: CatalogFilters): CatalogFilters {
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname !== CATALOG_PATH) return fallback;
  return parseCatalogFilters({
    sport: params.get("sport"),
    sort: params.get("sort"),
    q: params.get("q"),
  });
}

function filterKey(filters: CatalogFilters): string {
  return catalogSearch(filters) || "?";
}

function TopRow() {
  return (
    <div className="flex items-center gap-1 px-2 pt-2">
      <Link
        href="/"
        data-nav-back=""
        onClick={(event) => backLinkClick(event, "/")}
        aria-label="Back to Home"
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-zinc-900/[0.05] dark:hover:bg-white/10 ${tileFocusRing}`}
      >
        <ArrowLeft aria-hidden className="h-5 w-5" />
      </Link>
      <h1 className="min-w-0 truncate text-[1.75rem] leading-9 font-semibold tracking-tight">Catalog</h1>
    </div>
  );
}

/** Movers only, in one swipeable row. Hidden when nothing is moving. */
export function CatalogMovers({ payload }: { payload: MovingTodayPayload | null }) {
  const list = useRef<HTMLUListElement>(null);
  useTapThroughDrift(list);
  const movers = useMemo<MovingTodaySale[]>(
    () => (payload?.sales ?? []).filter((sale) => sale.kind === "mover").slice(0, MOVING_RAIL_COUNT),
    [payload],
  );
  if (!payload || movers.length === 0) return null;
  return (
    <section aria-label={payload.title} data-catalog-movers="" className="pt-2 pb-3">
      <div className="flex h-6 items-center gap-1.5 px-4">
        <FreshnessDot day={payload.window === "day"} />
        <h2 className="shrink-0 text-15 leading-6 font-semibold tracking-tight">{payload.title}</h2>
      </div>
      <ul ref={list} data-no-pull="" data-mover-rail="" className={`mt-2 ${RAIL_LIST}`}>
        {movers.map((sale, index) => (
          <MoverTile
            key={sale.cardId}
            sale={sale}
            index={index}
            variant={index === 0 ? "top" : "rail"}
            prefetch={index < RAIL_PREFETCH_TILES}
          />
        ))}
      </ul>
    </section>
  );
}

function SearchBox({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex min-h-11 items-center gap-2 rounded-full bg-zinc-200/60 pl-4 focus-within:ring-2 focus-within:ring-violet-600 dark:bg-white/[0.07]"
    >
      <Search className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Player or set"
        aria-label="Search by player or set"
        enterKeyHint="search"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-15 outline-none placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 ${tileFocusRing}`}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : (
        <span aria-hidden className="w-2" />
      )}
    </form>
  );
}

function SportChips({ sport, onChange }: { sport: CatalogSport | null; onChange: (next: CatalogSport | null) => void }) {
  const options = [{ id: null, label: "All" }, ...CATALOG_SPORTS] as { id: CatalogSport | null; label: string }[];
  return (
    <div
      role="group"
      aria-label="Sport"
      data-no-pull=""
      data-sport-chips=""
      className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => {
        const active = option.id === sport;
        return (
          <button
            key={option.id ?? "all"}
            type="button"
            aria-pressed={active}
            data-sport={option.id ?? "all"}
            onClick={() => onChange(option.id)}
            className={`${CHIP} ${tileFocusRing} ${active ? CHIP_ON : CHIP_OFF}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Newest / Most liked / Graded only, with a purple pill behind the open one. */
function SortControl({
  sort,
  reduced,
  onChange,
}: {
  sort: CatalogSort;
  reduced: boolean;
  onChange: (next: CatalogSort) => void;
}) {
  const index = CATALOG_SORTS.findIndex((option) => option.id === sort);
  return (
    <div
      role="radiogroup"
      aria-label="Sort"
      data-catalog-sort=""
      className="relative mx-4 grid grid-cols-3 rounded-full bg-zinc-900/[0.06] p-1 dark:bg-white/[0.06]"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-violet-600 ${
          reduced ? "" : "transition-transform duration-200 ease-out"
        } motion-reduce:transition-none`}
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {CATALOG_SORTS.map((option) => {
        const active = option.id === sort;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-sort={option.id}
            onClick={() => onChange(option.id)}
            className={`relative z-[1] flex min-h-11 items-center justify-center rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-200 ${tileFocusRing} ${
              active ? "text-white" : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CatalogTileSkeleton() {
  return (
    <li data-skeleton-tile="" aria-hidden="true" className="min-w-0">
      <div className="p-1">
        <div className="skeleton-shimmer aspect-[3/5] w-full rounded-[10px] dark:bg-white/[0.06]" />
        <div className="mt-2 px-0.5">
          <div className="flex h-5 items-center">
            <div className="h-3 w-4/5 rounded bg-zinc-200/80 dark:bg-white/[0.06]" />
          </div>
          <div className="flex h-4 items-center">
            <div className="h-2.5 w-3/5 rounded bg-zinc-200/60 dark:bg-white/[0.04]" />
          </div>
        </div>
      </div>
    </li>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <ul aria-label="Loading cards" aria-busy="true" data-catalog-skeleton="" className={GRID}>
      {Array.from({ length: count }, (_, n) => (
        <CatalogTileSkeleton key={n} />
      ))}
    </ul>
  );
}

/** No public cards anywhere: an invitation, never a blank page. */
export function CatalogEmpty({ signedIn }: { signedIn: boolean }) {
  return (
    <div data-catalog-empty="" className="flex flex-col items-center px-6 pt-10 pb-16 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-3xl bg-violet-600/10 ring-1 ring-violet-600/20">
        <Logo className="h-14 w-14" />
      </div>
      <h2 className="mt-6 text-xl font-semibold tracking-tight">No cards on Slabhold yet</h2>
      <p className="mt-1.5 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        Every public card collectors add shows up here.
      </p>
      <Link href={signedIn ? "/cards/new" : "/signup"} className={`mt-6 ${PRIMARY} ${tileFocusRing}`}>
        {signedIn ? "Add a card" : "Join Slabhold"}
      </Link>
    </div>
  );
}

type Status = "ready" | "loading" | "failed";

/**
 * The Slabhold Catalog: every public card, newest first, in a 2-column grid
 * that reads the next page before you reach the end. Search, sport and sort
 * live in the URL. Movers sit in a small row above, only when something moved.
 */
export function CatalogView({
  initial,
  initialFilters = DEFAULT_CATALOG_FILTERS,
  movers = null,
  signedIn = false,
}: {
  initial: CatalogPage;
  initialFilters?: CatalogFilters;
  movers?: MovingTodayPayload | null;
  signedIn?: boolean;
}) {
  const reduced = useReducedMotion();
  const [filters, setFilters] = useState<CatalogFilters>(() => filtersNow(initialFilters));
  const [draft, setDraft] = useState(filters.q);
  // A server read that failed hands over no tiles but a next page: read it here.
  const startsFromProps =
    sameCatalogFilters(filters, initialFilters) && !(initial.tiles.length === 0 && initial.nextOffset != null);
  const [tiles, setTiles] = useState<CatalogTile[]>(() => (startsFromProps ? initial.tiles : []));
  const [nextOffset, setNextOffset] = useState<number | null>(() => (startsFromProps ? initial.nextOffset : 0));
  const [status, setStatus] = useState<Status>(startsFromProps ? "ready" : "loading");
  const [more, setMore] = useState<Status>("ready");
  const [switched, setSwitched] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  const loadedKey = useRef<string | null>(startsFromProps ? filterKey(filters) : null);
  const moreAbort = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const key = filterKey(filters);

  // First page for the current filters. The server already read the URL's.
  useEffect(() => {
    if (loadedKey.current === key) return;
    moreAbort.current?.abort();
    const controller = new AbortController();
    setStatus("loading");
    setMore("ready");
    void (async () => {
      try {
        const response = await fetch(`${CATALOG_API}${catalogSearch(filters)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Catalog unavailable");
        const page = (await response.json()) as CatalogPage;
        loadedKey.current = key;
        setTiles(page.tiles ?? []);
        setNextOffset(page.nextOffset ?? null);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("failed");
      }
    })();
    return () => controller.abort();
    // `filters` is captured by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const loadMore = useCallback(() => {
    if (status !== "ready" || more === "loading" || nextOffset == null) return;
    moreAbort.current?.abort();
    const controller = new AbortController();
    moreAbort.current = controller;
    setMore("loading");
    const forKey = key;
    void (async () => {
      try {
        const response = await fetch(`${CATALOG_API}${catalogSearch(filters, nextOffset)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Catalog unavailable");
        const page = (await response.json()) as CatalogPage;
        if (loadedKey.current !== forKey) return;
        setTiles((current) => appendCatalogTiles(current, page.tiles ?? []));
        setNextOffset(page.nextOffset ?? null);
        setMore("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMore("failed");
      }
    })();
  }, [filters, key, more, nextOffset, status]);

  // Read the next page well before the reader reaches the last row.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || status !== "ready" || more !== "ready" || nextOffset == null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: LOAD_AHEAD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, more, nextOffset, status]);

  // A popstate to another query on this page follows the URL.
  useEffect(() => {
    const onPop = () => {
      const next = filtersNow(DEFAULT_CATALOG_FILTERS);
      setFilters((current) => (sameCatalogFilters(current, next) ? current : next));
      setDraft(next.q);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((next: CatalogFilters) => {
    if (sameCatalogFilters(filtersRef.current, next)) return;
    const clean = { ...next, q: cleanCatalogSearch(next.q) };
    filtersRef.current = clean;
    setSwitched(true);
    setFilters(clean);
    window.history.replaceState(window.history.state, "", `${CATALOG_PATH}${catalogSearch(clean)}`);
  }, []);

  // Typing settles before it reads.
  useEffect(() => {
    if (cleanCatalogSearch(draft) === filters.q) return;
    const timer = setTimeout(() => update({ ...filters, q: draft }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, filters, update]);

  const nothingAtAll = status === "ready" && tiles.length === 0 && !catalogFiltersActive(filters);
  const animate = !switched && !reduced;

  return (
    <div className="relative -mx-4 -mt-5" data-catalog="">
      <TopRow />
      <CatalogMovers payload={movers} />

      <div data-catalog-search="" data-no-pull="" className={`sticky top-[var(--app-header-h)] z-10 px-4 py-2 ${CHROME}`}>
        <SearchBox value={draft} onChange={setDraft} onSubmit={() => update({ ...filters, q: draft })} />
      </div>
      <div className="space-y-3 pt-1 pb-3">
        <SortControl sort={filters.sort} reduced={reduced} onChange={(sort) => update({ ...filters, sort })} />
        <SportChips sport={filters.sport} onChange={(sport) => update({ ...filters, sport })} />
      </div>

      {status === "loading" ? (
        <SkeletonGrid count={6} />
      ) : status === "failed" ? (
        <div className="px-4 py-14 text-center">
          <p className="text-15 font-semibold">Couldn&apos;t load cards</p>
          <button
            type="button"
            onClick={() => {
              loadedKey.current = null;
              setAttempt((n) => n + 1);
            }}
            className={`mt-2 min-h-11 rounded-full px-4 text-sm font-semibold text-[#7C3AED] dark:text-[#A78BFA] ${tileFocusRing}`}
          >
            Try again
          </button>
        </div>
      ) : nothingAtAll ? (
        <CatalogEmpty signedIn={signedIn} />
      ) : tiles.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p data-catalog-no-match="" className="text-15 font-semibold">
            {catalogNoMatchText(filters)}
          </p>
          <button
            type="button"
            onClick={() => {
              setDraft("");
              update(DEFAULT_CATALOG_FILTERS);
            }}
            className={`mt-2 min-h-11 rounded-full px-4 text-sm font-semibold text-[#7C3AED] dark:text-[#A78BFA] ${tileFocusRing}`}
          >
            Show all cards
          </button>
        </div>
      ) : (
        <>
          <ul
            key={key}
            aria-label="Public cards"
            data-catalog-grid={filters.sort}
            className={`${GRID} ${switched && !reduced ? SWAP : ""} ${nextOffset != null ? "pb-0" : ""}`}
          >
            {tiles.map((tile, index) => (
              <CardTile
                key={tile.id}
                card={tileCard(tile)}
                href={tile.href}
                index={index}
                ariaLabel={catalogTileName(tile)}
                priceLabel={tile.priceLabel || null}
                noValue={false}
                prefetch={index < PAINTED_TILES}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className={`min-w-0 ${index >= PAINTED_TILES ? OFFSCREEN_TILE : ""} ${
                  animate && index < STAGGER_TILES ? ENTER : ""
                }`}
                style={animate && index < STAGGER_TILES ? { animationDelay: `${index * STAGGER_MS}ms` } : undefined}
              />
            ))}
            {more === "loading" ? [0, 1].map((n) => <CatalogTileSkeleton key={`more-${n}`} />) : null}
          </ul>
          {nextOffset != null ? (
            <div ref={sentinel} data-catalog-more="" className="px-4 pt-2 pb-8 text-center">
              {more === "failed" ? (
                <button
                  type="button"
                  onClick={loadMore}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold text-[#7C3AED] dark:text-[#A78BFA] ${tileFocusRing}`}
                >
                  Couldn&apos;t load more. Try again
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
