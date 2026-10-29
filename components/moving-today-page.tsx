"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { CardTile, GainChip, tileFocusRing } from "@/components/card-tile";
import { Logo } from "@/components/logo";
import {
  Freshness,
  FreshnessDot,
  MoverTile,
  TOP_GLOW,
} from "@/components/moving-today";
import { ShareIconButton } from "@/components/share-button";
import { useReducedMotion } from "@/components/timeline-ui";
import {
  directionCounts,
  directionTiles,
  filtersFromSearch,
  moverAccessibleName,
  moverGain,
  moverTileCard,
  movingQuery,
  noMatchText,
  sportChips,
  type MoverDirection,
  type MovingFilters,
  type MovingSport,
} from "@/lib/moving-today/rail";
import { MOVING_TODAY_PATH, type MovingTodayPayload } from "@/lib/moving-today/types";

const SEGMENTS: { id: MoverDirection; label: string }[] = [
  { id: "up", label: "Up" },
  { id: "down", label: "Down" },
  { id: "all", label: "All" },
];

/** Tiles fade and rise in, 30ms apart, on the first paint only. */
const STAGGER_MS = 30;
const STAGGER_TILES = 12;
const ENTER = "motion-safe:animate-[tile-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
/** A segment or sport switch crossfades the grid instead of replaying the stagger. */
const SWAP = "motion-safe:animate-[lightbox-fade_160ms_ease-out_both]";

/**
 * Past the first two rows, tiles skip layout and paint until scrolled near.
 * Only those first rows prefetch their card page.
 */
const PAINTED_TILES = 4;
const OFFSCREEN_TILE = "[content-visibility:auto] [contain-intrinsic-size:auto_180px_auto_340px]";

/** The same translucent blur as the app header and Home tabs. */
const CHROME = "bg-[var(--chrome-bg)] backdrop-blur-xl backdrop-saturate-150";

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-bold text-white transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]";

function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      data-moving-backdrop=""
      className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.18),transparent_60%)]"
    />
  );
}

function TopRow({ payload }: { payload: MovingTodayPayload }) {
  return (
    <div className="flex items-center justify-between px-2 pt-2">
      <Link
        href="/"
        data-nav-back=""
        aria-label="Back to Home"
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-zinc-900/[0.05] dark:hover:bg-white/10 ${tileFocusRing}`}
      >
        <ArrowLeft aria-hidden className="h-5 w-5" />
      </Link>
      <ShareIconButton path={MOVING_TODAY_PATH} title={payload.title} label="Share" variant="ghost" />
    </div>
  );
}

/** The top mover, large, beside its move, price and sale date. */
function Featured({ payload, reduced }: { payload: MovingTodayPayload; reduced: boolean }) {
  const sale = payload.sales[0];
  const gain = sale ? moverGain(sale) : null;
  if (!sale || sale.kind !== "mover" || !gain) return null;
  return (
    <div data-featured={sale.cardId} className="mt-5 flex items-center gap-4">
      <CardTile
        card={moverTileCard(sale)}
        href={sale.href}
        index={0}
        ariaLabel={moverAccessibleName(sale)}
        priceLabel={null}
        prefetch
        as="div"
        sizes="172px"
        className={`w-[172px] shrink-0 ${TOP_GLOW} ${reduced ? "" : ENTER}`}
      />
      <div className="min-w-0 flex-1 pb-12">
        <p className="font-mono text-[10px] font-semibold tracking-wider text-[#7C3AED] uppercase dark:text-[#A78BFA]">
          Top mover
        </p>
        <div className="mt-2">
          <GainChip gain={gain} large />
        </div>
        <p className="mt-3 text-2xl leading-7 font-extrabold tracking-tight tabular-nums">{sale.priceLabel}</p>
        {sale.soldLabel ? <p className="mt-0.5 text-[13px] text-zinc-500">Sold {sale.soldLabel}</p> : null}
        <p className="mt-0.5 text-[13px] text-zinc-500">vs. recent sold prices</p>
      </div>
    </div>
  );
}

function Hero({ payload, reduced }: { payload: MovingTodayPayload; reduced: boolean }) {
  const day = payload.window === "day";
  const featured = payload.sales[0]?.kind === "mover";
  return (
    <section data-moving-hero="" className="px-4 pt-1 pb-5">
      <div className="flex items-center gap-2">
        <FreshnessDot day={day} still={reduced} />
        <h1 className="min-w-0 truncate text-[28px] leading-9 font-extrabold tracking-tight">{payload.title}</h1>
      </div>
      <p className="mt-0.5 min-h-5 truncate text-[13px] leading-5 text-zinc-500">
        {payload.dateLabel ? (
          <span className="font-mono text-[11px] tracking-wider uppercase">{payload.dateLabel}</span>
        ) : null}
        <Freshness payload={payload} lead={Boolean(payload.dateLabel)} />
      </p>
      <p data-moving-count="" className="mt-0.5 text-[13px] font-medium text-zinc-700 tabular-nums dark:text-zinc-300">
        {payload.totalCount} {payload.totalCount === 1 ? "card" : "cards"} · {payload.moverCount} moving
      </p>
      {featured ? (
        <Featured payload={payload} reduced={reduced} />
      ) : (
        <p className="mt-3 text-[15px] text-zinc-600 dark:text-zinc-400">The newest cards on Slabhold</p>
      )}
    </section>
  );
}

/** Up / Down / All with a purple pill that slides behind the open segment. */
function Segments({
  direction,
  counts,
  reduced,
  onChange,
}: {
  direction: MoverDirection;
  counts: Record<MoverDirection, number>;
  reduced: boolean;
  onChange: (next: MoverDirection) => void;
}) {
  const index = SEGMENTS.findIndex((segment) => segment.id === direction);
  const enabled = (id: MoverDirection) => counts[id] > 0 || id === direction;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : SEGMENTS.length - 1;
    let next = index;
    for (let tries = 0; tries < SEGMENTS.length; tries += 1) {
      next = (next + step) % SEGMENTS.length;
      if (enabled(SEGMENTS[next]!.id)) break;
    }
    const target = SEGMENTS[next]!;
    onChange(target.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`#moving-tab-${target.id}`)?.focus();
  }

  return (
    <div data-moving-segments="" data-no-pull="" className={`sticky top-[var(--app-header-h)] z-10 px-4 py-2 ${CHROME}`}>
      <div
        role="tablist"
        aria-label="Direction"
        onKeyDown={onKeyDown}
        className="relative grid grid-cols-3 rounded-full bg-zinc-900/[0.06] p-1 dark:bg-white/[0.06]"
      >
        <span
          aria-hidden="true"
          data-segment-pill=""
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-violet-600 shadow-[0_6px_16px_-8px_rgba(91,33,182,0.8)] ${
            reduced ? "" : "transition-transform duration-200 ease-out"
          } motion-reduce:transition-none`}
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {SEGMENTS.map((segment) => {
          const active = segment.id === direction;
          const count = counts[segment.id];
          const disabled = !enabled(segment.id);
          return (
            <button
              key={segment.id}
              id={`moving-tab-${segment.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="moving-grid"
              aria-label={`${segment.label}, ${count} ${count === 1 ? "card" : "cards"}`}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              data-direction={segment.id}
              onClick={() => onChange(segment.id)}
              className={`relative z-[1] flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors duration-200 disabled:opacity-40 ${tileFocusRing} ${
                active ? "text-white" : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {segment.label}
              <span
                className={`text-xs font-medium tabular-nums ${active ? "text-white/80" : "text-zinc-500"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SportFilter({
  chips,
  sport,
  onChange,
}: {
  chips: { id: MovingSport; label: string; count: number }[];
  sport: MovingSport | null;
  onChange: (next: MovingSport | null) => void;
}) {
  if (chips.length === 0) return null;
  const options = [{ id: null, label: "All" } as const, ...chips];
  return (
    <div
      role="group"
      aria-label="Sport"
      data-no-pull=""
      data-sport-chips=""
      className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${tileFocusRing} ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "bg-zinc-900/[0.05] text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** No public cards anywhere: an invitation, never a blank page or a redirect. */
export function MovingEmpty({ signedIn }: { signedIn: boolean }) {
  return (
    <div data-moving-empty="" className="flex flex-col items-center px-6 pt-10 pb-16 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-3xl bg-violet-600/10 ring-1 ring-violet-600/20">
        <Logo className="h-14 w-14" />
      </div>
      <h2 className="mt-6 text-xl font-extrabold tracking-tight">No cards on Slabhold yet</h2>
      <p className="mt-1.5 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        Public cards show up here with their recent sold prices.
      </p>
      <Link href={signedIn ? "/cards/new" : "/signup"} className={`mt-6 ${PRIMARY} ${tileFocusRing}`}>
        {signedIn ? "Add a card" : "Join Slabhold"}
      </Link>
    </div>
  );
}

/**
 * On Back the router redraws this page from props fetched before the reader
 * switched a tab, but the URL kept the switch (history.replaceState). Read it
 * while rendering, so the first client paint is already filtered and the
 * restored scroll lands on the same tile. On the server, and on a fresh load
 * where the server read the same URL, the props already match.
 */
function filtersNow(fallback: MovingFilters): MovingFilters {
  if (typeof window === "undefined") return fallback;
  return filtersFromSearch(window.location.search, fallback);
}

/**
 * See all: a hero with the top mover, a sticky Up / Down / All control, sport
 * chips, then a 2-column grid of shared tiles. All is movers by the size of
 * the move, then the newest public cards. The filters live in the URL.
 */
export function MovingTodayAll({
  payload,
  initialDirection,
  initialSport = null,
  signedIn = false,
}: {
  payload: MovingTodayPayload;
  initialDirection: MoverDirection;
  initialSport?: MovingSport | null;
  signedIn?: boolean;
}) {
  const [{ direction, sport }, setFilters] = useState<MovingFilters>(() =>
    filtersNow({ direction: initialDirection, sport: initialSport }),
  );
  const [switched, setSwitched] = useState(false);

  // A popstate to another query on this same page follows the URL too.
  useEffect(() => {
    const onPop = () =>
      setFilters((current) => {
        const next = filtersFromSearch(window.location.search, current);
        return next.direction === current.direction && next.sport === current.sport ? current : next;
      });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const reduced = useReducedMotion();
  const chips = useMemo(() => sportChips(payload.sales), [payload.sales]);
  const activeSport = sport && chips.some((chip) => chip.id === sport) ? sport : null;
  const counts = useMemo(() => directionCounts(payload.sales, activeSport), [payload.sales, activeSport]);
  const list = useMemo(
    () => directionTiles(payload.sales, direction, activeSport),
    [payload.sales, direction, activeSport],
  );

  function update(nextDirection: MoverDirection, nextSport: MovingSport | null) {
    if (nextDirection === direction && nextSport === activeSport) return;
    setFilters({ direction: nextDirection, sport: nextSport });
    setSwitched(true);
    navigator.vibrate?.(8);
    window.history.replaceState(null, "", movingQuery(nextDirection, nextSport));
  }

  if (payload.sales.length === 0) {
    return (
      <div className="relative -mx-4 -mt-5" data-moving-all="">
        <HeroBackdrop />
        <div className="relative">
          <TopRow payload={payload} />
          <MovingEmpty signedIn={signedIn} />
        </div>
      </div>
    );
  }

  const animate = !switched && !reduced;
  return (
    <div className="relative -mx-4 -mt-5" data-moving-all="">
      <HeroBackdrop />
      <div className="relative">
        <TopRow payload={payload} />
        <Hero payload={payload} reduced={reduced} />
      </div>
      <Segments direction={direction} counts={counts} reduced={reduced} onChange={(next) => update(next, activeSport)} />
      <SportFilter chips={chips} sport={activeSport} onChange={(next) => update(direction, next)} />

      {list.length === 0 ? (
        <div id="moving-grid" role="tabpanel" aria-labelledby={`moving-tab-${direction}`} className="px-4 py-14 text-center">
          <p data-moving-no-match="" className="text-[15px] font-semibold">
            {noMatchText(direction, activeSport)}
          </p>
          <button
            type="button"
            onClick={() => update("all", null)}
            className={`mt-2 min-h-11 rounded-full px-4 text-sm font-semibold text-[#7C3AED] dark:text-[#A78BFA] ${tileFocusRing}`}
          >
            Show all
          </button>
        </div>
      ) : (
        <ul
          key={`${direction}-${activeSport ?? "all"}`}
          id="moving-grid"
          role="tabpanel"
          aria-labelledby={`moving-tab-${direction}`}
          data-mover-grid={direction}
          className={`grid grid-cols-2 gap-x-2 gap-y-3 px-3 pt-1 pb-8 sm:grid-cols-3 ${switched && !reduced ? SWAP : ""}`}
        >
          {list.map((sale, index) => (
            <MoverTile
              key={sale.cardId}
              sale={sale}
              index={index}
              variant="grid"
              prefetch={index < PAINTED_TILES}
              className={`${index >= PAINTED_TILES ? OFFSCREEN_TILE : ""} ${
                animate && index < STAGGER_TILES ? ENTER : ""
              }`}
              style={animate && index < STAGGER_TILES ? { animationDelay: `${index * STAGGER_MS}ms` } : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
