"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type RefObject,
} from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { CardTile, tileFocusRing } from "@/components/card-tile";
import { ShareIconButton } from "@/components/share-button";
import { EAGER_TILES } from "@/lib/collection/grid";
import { freshenMovingToday, MOVING_TODAY_MIN_WEEK_MOVERS, splitMovers } from "@/lib/moving-today/rank";
import {
  compactRangeLabel,
  countUpText,
  moveBadgeText,
  moverAccessibleName,
  moverFreshness,
  moverGain,
  moverTileCard,
  MOVING_RAIL_COUNT,
  type MoverDirection,
} from "@/lib/moving-today/rail";
import {
  MOVING_TODAY_PATH,
  shouldShowMovingToday,
  type MovingTodayPayload,
  type MovingTodaySale,
} from "@/lib/moving-today/types";

/** Rail widths: the top mover is a little larger. The third tile is cut at 390px, so the row reads as a swipe. */
export const RAIL_TOP_WIDTH = "w-[132px]";
export const RAIL_TILE_WIDTH = "w-[120px]";

/** A soft purple glow on the top mover's slab only, not a box around the tile. */
const TOP_GLOW = "[&_[data-kind]]:drop-shadow-[0_10px_22px_rgba(124,58,237,0.42)]";

/** Tiles past the first three start off screen: they skip layout and paint until swiped near. */
const RAIL_PAINTED_TILES = 3;

/** The first paint hydrates this many tiles. The rest mount when the page is idle. */
export const RAIL_FIRST_TILES = 4;
const OFFSCREEN_TILE = "[content-visibility:auto] [contain-intrinsic-size:auto_120px_auto_257px]";

const STAGGER_MS = 35;
/** Only tiles that start on screen fade in. */
const STAGGER_TILES = 3;
const COUNT_UP_MS = 480;

const ENTER = "motion-safe:animate-[tile-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const DOT_PULSE = "motion-safe:animate-[live-dot_2.4s_ease-in-out_infinite]";

/** The rail fades in once per page load, not on every lane switch or remount. */
let railEntered = false;

const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let clockNow = 0;

function subscribeMinute(listener: () => void) {
  minuteListeners.add(listener);
  minuteTimer ??= setInterval(() => {
    clockNow = Date.now();
    minuteListeners.forEach((fn) => fn());
  }, 60_000);
  return () => {
    minuteListeners.delete(listener);
    if (minuteListeners.size === 0 && minuteTimer) {
      clearInterval(minuteTimer);
      minuteTimer = null;
      clockNow = 0;
    }
  };
}

/** Stable between ticks, as useSyncExternalStore needs. */
function clockSnapshot() {
  if (!clockNow) clockNow = Date.now();
  return clockNow;
}

/** Null while hydrating, so "12m ago" never comes from a stale server render. */
function useMinute(): number | null {
  return useSyncExternalStore(subscribeMinute, clockSnapshot, () => null);
}

/** Warm the page a finger lands on. Links themselves don't prefetch. */
function useWarmOnPointerDown() {
  const router = useRouter();
  const warmed = useRef(new Set<string>());
  return (event: PointerEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='/']");
    const href = link?.getAttribute("href");
    if (!href || warmed.current.has(href)) return;
    warmed.current.add(href);
    router.prefetch(href);
  };
}

function reducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * The % chips count up from 0 once, only for tiles in view that are still
 * entering. A hydrated server render that already painted keeps its numbers.
 */
function useChipCountUp(list: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = list.current;
    if (!enabled || !root || reducedMotion()) return;
    const box = root.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= window.innerHeight) return;
    const nodes: { node: Text; final: string }[] = [];
    for (const chip of root.querySelectorAll<HTMLElement>("[data-gain-text]")) {
      const rect = chip.getBoundingClientRect();
      if (rect.right <= box.left || rect.left >= box.right) continue;
      const tile = chip.closest<HTMLElement>("[data-tile]");
      const entering = tile?.getAnimations?.().some((animation) => animation.playState === "running");
      if (!entering) continue;
      const node = chip.firstChild;
      if (node instanceof Text && node.nodeValue) nodes.push({ node, final: node.nodeValue });
    }
    if (nodes.length === 0) return;
    const start = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / COUNT_UP_MS);
      const eased = 1 - (1 - progress) ** 3;
      for (const { node, final } of nodes) node.nodeValue = countUpText(final, eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    for (const { node, final } of nodes) node.nodeValue = countUpText(final, 0);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      for (const { node, final } of nodes) node.nodeValue = final;
    };
  }, [list, enabled]);
}

function FreshnessDot({ day }: { day: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-live-dot={day ? "day" : "week"}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${day ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500"} ${DOT_PULSE}`}
    />
  );
}

/** "LIVE · Updated 12m ago". Empty until the client knows the time. */
function Freshness({
  payload,
  lead,
  short = false,
}: {
  payload: MovingTodayPayload;
  lead: boolean;
  /** The rail drops the word "Updated" on a 390px phone so the line fits. */
  short?: boolean;
}) {
  const now = useMinute();
  const fresh = now == null ? null : moverFreshness(payload.updatedAt, payload.window, now);
  if (!fresh) return null;
  return (
    <span data-freshness="">
      {lead ? " · " : ""}
      {fresh.live ? (
        <span className="font-mono text-[10px] font-semibold tracking-wider text-emerald-600 uppercase dark:text-emerald-400">
          Live ·{" "}
        </span>
      ) : null}
      {short ? (
        <>
          <span className="max-[399px]:hidden">Updated </span>
          {fresh.label.replace(/^Updated /, "")}
        </>
      ) : (
        fresh.label
      )}
    </span>
  );
}

const SEE_ALL_LINK =
  "text-[#7C3AED] dark:text-[#A78BFA] font-semibold";

function MoverTile({
  sale,
  index,
  variant,
  animate = false,
}: {
  sale: MovingTodaySale;
  index: number;
  variant: "top" | "rail" | "grid";
  animate?: boolean;
}) {
  const rail = variant !== "grid";
  const badge = variant === "top" ? moveBadgeText(sale.percent) : "";
  const gain = moverGain(sale);
  return (
    <CardTile
      card={moverTileCard(sale)}
      href={sale.href}
      // The first three load eagerly. The rest wait for the scroll.
      index={index < 3 ? index : index + EAGER_TILES}
      ariaLabel={moverAccessibleName(sale)}
      priceLabel={sale.priceLabel}
      gain={gain}
      prefetch={false}
      as="li"
      density="compact"
      sizes={rail ? "120px" : "(min-width: 1024px) 180px, (min-width: 640px) 25vw, 33vw"}
      className={
        rail
          ? `shrink-0 snap-start ${variant === "top" ? `${RAIL_TOP_WIDTH} ${TOP_GLOW}` : RAIL_TILE_WIDTH} ${
              index >= RAIL_PAINTED_TILES ? OFFSCREEN_TILE : ""
            } ${animate && index < STAGGER_TILES ? ENTER : ""}`
          : "min-w-0"
      }
      style={animate ? { animationDelay: `${index * STAGGER_MS}ms` } : undefined}
    >
      {badge && gain ? (
        // Straddles the slab's bottom edge, so the top tile is no taller below the art.
        <span
          data-top-badge=""
          aria-hidden="true"
          className={`pointer-events-none absolute top-[calc((132px-8px)*5/3-12px)] left-1/2 inline-flex h-5 -translate-x-1/2 items-center rounded-full px-2 text-[10px] font-semibold whitespace-nowrap tabular-nums shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] backdrop-blur-sm ${
            gain.tone === "up"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-400"
              : "bg-rose-50 text-rose-700 dark:bg-rose-950/90 dark:text-rose-400"
          }`}
        >
          {badge}
        </span>
      ) : null}
      {rail ? null : (
        <p className="px-1.5 pb-1 text-[11px] leading-4 text-zinc-500">Sold {sale.soldLabel}</p>
      )}
    </CardTile>
  );
}

const RAIL_LIST =
  "flex snap-x snap-mandatory scroll-px-4 items-end gap-2.5 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden after:w-1.5 after:shrink-0 after:content-['']";

/**
 * Home movers: one line of header, then a swipeable row of shared card tiles,
 * biggest move first, ending in "See all N". Thin weeks get the quiet row.
 */
export function MovingTodayPanel({ payload }: { payload: MovingTodayPayload }) {
  const [animate] = useState(() => !railEntered);
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const warm = useWarmOnPointerDown();
  useEffect(() => {
    railEntered = true;
    // Off-screen tiles wait for an idle moment, so hydration stays short.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => setExpanded(true), { timeout: 1200 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(() => setExpanded(true), 200);
    return () => clearTimeout(timer);
  }, []);
  useChipCountUp(list, animate);

  const sales = shouldShowMovingToday(payload.sales) ? payload.sales : [];
  if (sales.length < MOVING_TODAY_MIN_WEEK_MOVERS) return <MovingQuiet />;
  const shown = sales.slice(0, expanded ? MOVING_RAIL_COUNT : RAIL_FIRST_TILES);
  const day = payload.window === "day";
  const range = day ? "" : compactRangeLabel(payload.dateLabel);

  return (
    <section
      aria-label={payload.title}
      data-moving-today=""
      onPointerDown={warm}
      className="py-3"
    >
      <div className="flex h-6 items-center gap-1.5 px-4">
        <FreshnessDot day={day} />
        <h2 className="shrink-0 text-[15px] leading-6 font-bold tracking-tight">{payload.title}</h2>
        <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">
          {range ? <span className="font-mono">· {range}</span> : null}
          <Freshness payload={payload} lead={Boolean(range)} short />
        </p>
        <Link
          href={MOVING_TODAY_PATH}
          prefetch={false}
          aria-label={`See all ${sales.length} movers`}
          className={`-my-2.5 shrink-0 rounded py-2.5 pl-2 text-[13px] ${SEE_ALL_LINK} ${tileFocusRing}`}
        >
          See all
        </Link>
      </div>
      <ul ref={list} data-no-pull="" data-mover-rail="" className={`mt-2 ${RAIL_LIST}`}>
        {shown.map((sale, index) => (
          <MoverTile
            key={sale.cardId}
            sale={sale}
            index={index}
            variant={index === 0 ? "top" : "rail"}
            animate={animate}
          />
        ))}
        <li
          className={`${RAIL_TILE_WIDTH} shrink-0 snap-start self-stretch p-1 ${OFFSCREEN_TILE}`}
        >
          <Link
            href={MOVING_TODAY_PATH}
            prefetch={false}
            data-see-all-tile=""
            className={`flex h-full min-h-44 flex-col items-center justify-center gap-1 rounded-[10px] bg-zinc-100 text-center transition-transform duration-150 ease-out motion-safe:active:scale-[0.97] dark:bg-white/[0.04] ${tileFocusRing}`}
          >
            <span className={`text-[13px] ${SEE_ALL_LINK}`}>See all {sales.length}</span>
            <ChevronRight aria-hidden className="h-4 w-4 text-zinc-400" />
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** A thin week: one slim row, the header's height, no tiles. */
export function MovingQuiet() {
  return (
    <section aria-label="Moving this week" data-moving-today="quiet" className="py-3">
      <Link
        href="/cards/new"
        className={`-my-2.5 flex min-h-11 items-center gap-1 px-4 text-[12px] leading-6 sm:text-[13px] ${tileFocusRing}`}
      >
        <span className="min-w-0 truncate">
          <span className="text-zinc-500">Prices are quiet this week. </span>
          <span className="font-semibold">Add a card to see its comps</span>
        </span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      </Link>
    </section>
  );
}

function TileSkeleton({ top }: { top: boolean }) {
  return (
    <li className={`${top ? RAIL_TOP_WIDTH : RAIL_TILE_WIDTH} shrink-0`} data-skeleton-tile="">
      <div className="p-1">
        <div className="skeleton-shimmer aspect-[3/5] w-full rounded-[10px] dark:bg-white/[0.06]" />
        <div className="mt-1.5 px-0.5">
          <div className="flex h-[18px] items-center">
            <div className="h-3 w-4/5 rounded bg-zinc-200/80 dark:bg-white/[0.06]" />
          </div>
          <div className="flex h-4 items-center">
            <div className="h-2.5 w-3/5 rounded bg-zinc-200/60 dark:bg-white/[0.04]" />
          </div>
          <div className="mt-0.5 flex h-5 items-center">
            <div className="h-3 w-1/2 rounded bg-zinc-200/80 dark:bg-white/[0.06]" />
          </div>
        </div>
      </div>
    </li>
  );
}

/** Same header row and tile widths as the rail, so the swap does not move anything. */
export function MovingTodaySkeleton() {
  return (
    <section aria-label="Loading movers" aria-busy="true" data-moving-today="skeleton" className="py-3">
      <div className="flex h-6 items-center gap-1.5 px-4" aria-hidden="true">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <div className="h-3.5 w-32 rounded bg-zinc-200/80 dark:bg-white/[0.06]" />
        <div className="ml-auto h-3 w-11 rounded bg-zinc-200/60 dark:bg-white/[0.04]" />
      </div>
      <ul aria-hidden="true" className={`mt-2 ${RAIL_LIST} overflow-x-hidden`}>
        {[0, 1, 2, 3].map((n) => (
          <TileSkeleton key={n} top={n === 0} />
        ))}
      </ul>
    </section>
  );
}

/** Renders the heading the server already computed, so midnight does not mismatch. */
export function MovingTodayCached({ payload }: { payload: MovingTodayPayload }) {
  return <MovingTodayPanel payload={payload} />;
}

/** Client fallback when the server read failed. A sized skeleton holds the spot. */
export function MovingToday() {
  const [view, setView] = useState<MovingTodayPayload | "loading" | null>("loading");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/moving-today", { signal: controller.signal });
        if (!response.ok) throw new Error("Moving today unavailable");
        const payload = freshenMovingToday((await response.json()) as MovingTodayPayload);
        if (cancelled) return;
        setView(payload);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setView(null);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (view === "loading") return <MovingTodaySkeleton />;
  if (!view) return null;
  return <MovingTodayPanel payload={view} />;
}

const SEGMENT =
  "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]";

/** See all: Up or Down, biggest move first, in a 3-column grid of shared tiles. */
export function MovingTodayAll({
  payload,
  initialDirection,
}: {
  payload: MovingTodayPayload;
  initialDirection: MoverDirection;
}) {
  const [direction, setDirection] = useState<MoverDirection>(initialDirection);
  const { up, down } = useMemo(() => splitMovers(payload.sales), [payload.sales]);
  const warm = useWarmOnPointerDown();
  const list = direction === "up" ? up : down;
  const period = payload.window === "day" ? "today" : "this week";

  function choose(next: MoverDirection) {
    if (next === direction) return;
    setDirection(next);
    navigator.vibrate?.(8);
    window.history.replaceState(null, "", `?dir=${next}`);
  }

  return (
    <div className="-mx-4 -mt-5" data-moving-all="">
      <header className="flex items-center gap-1 px-2 py-2">
        <Link
          href="/"
          data-nav-back=""
          aria-label="Back to Home"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 ${tileFocusRing}`}
        >
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg leading-6 font-bold tracking-tight">{payload.title}</h1>
            <FreshnessDot day={payload.window === "day"} />
          </div>
          <p className="truncate text-xs text-zinc-500">
            {payload.dateLabel ? (
              <span className="font-mono text-[11px] tracking-wider uppercase">{payload.dateLabel}</span>
            ) : null}
            <Freshness payload={payload} lead={Boolean(payload.dateLabel)} />
          </p>
        </div>
        <ShareIconButton path={MOVING_TODAY_PATH} title={payload.title} label="Share" variant="ghost" />
      </header>

      <div className="px-4 pb-3">
        <div
          role="group"
          aria-label="Direction"
          className="grid grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-white/[0.06]"
        >
          {(
            [
              { id: "up", label: "Up", count: up.length },
              { id: "down", label: "Down", count: down.length },
            ] as const
          ).map((option) => {
            const active = option.id === direction;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                data-direction={option.id}
                onClick={() => choose(option.id)}
                className={`${SEGMENT} ${tileFocusRing} ${
                  active
                    ? "bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:bg-white/[0.12]"
                    : "text-zinc-500"
                }`}
              >
                {option.label}
                <span className="text-xs font-medium text-zinc-500 tabular-nums">{option.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-zinc-500">
          No cards {direction === "up" ? "up" : "down"} {period} yet.
        </p>
      ) : (
        <ul
          key={direction}
          onPointerDown={warm}
          data-mover-grid={direction}
          className="grid grid-cols-3 gap-x-1.5 gap-y-3 px-3 pb-6 sm:grid-cols-4 lg:grid-cols-5"
        >
          {list.map((sale, index) => (
            <MoverTile key={sale.cardId} sale={sale} index={index} variant="grid" />
          ))}
        </ul>
      )}
    </div>
  );
}
