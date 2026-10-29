"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { ChevronRight } from "lucide-react";
import { CardTile, tileFocusRing } from "@/components/card-tile";
import { EAGER_TILES } from "@/lib/collection/grid";
import { freshenMovingToday } from "@/lib/moving-today/rank";
import {
  compactRangeLabel,
  moveBadgeText,
  moverAccessibleName,
  moverFreshness,
  moverGain,
  moverTileCard,
  MOVING_RAIL_COUNT,
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
export const TOP_GLOW = "[&_[data-kind]]:drop-shadow-[0_10px_22px_rgba(124,58,237,0.42)]";

/** Tiles past the first three start off screen: they skip layout and paint until swiped near. */
const RAIL_PAINTED_TILES = 3;

/**
 * Tiles on screen at 390px prefetch their whole card page (an ISR hit), so a
 * tap needs no request. The fourth starts off screen, so a swipe fetches nothing.
 */
export const RAIL_PREFETCH_TILES = RAIL_PAINTED_TILES;

/** The first paint hydrates this many tiles. The rest mount when the page is idle. */
export const RAIL_FIRST_TILES = 4;
const OFFSCREEN_TILE = "[content-visibility:auto] [contain-intrinsic-size:auto_120px_auto_257px]";

const STAGGER_MS = 35;
/** Only tiles that start on screen fade in. */
const STAGGER_TILES = 3;

const ENTER = "motion-safe:animate-[tile-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const DOT_PULSE = "motion-safe:animate-[live-dot_2.4s_ease-in-out_infinite]";
/** The client fallback's held box fades its final content in. */
const FADE_IN = "motion-safe:animate-[lightbox-fade_200ms_ease-out_both]";

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

/** Under this much finger travel, a touch on a rail tile is a tap. */
export const TAP_SLOP_PX = 8;

/**
 * iOS can start a snap scroll on a few pixels of drift and drop the click.
 * When the browser took the touch (pointercancel) but the finger moved less
 * than TAP_SLOP_PX, open the tile anyway. A real swipe never navigates.
 */
export function useTapThroughDrift(list: RefObject<HTMLElement | null>) {
  const router = useRouter();
  useEffect(() => {
    const root = list.current;
    if (!root) return;
    let start: { x: number; y: number; href: string } | null = null;
    let cancelled = false;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      cancelled = false;
      start = null;
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href^='/']");
      const href = link?.getAttribute("href");
      if (href) start = { x: event.clientX, y: event.clientY, href };
    };
    const onPointerCancel = () => {
      cancelled = true;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const tap = start;
      const wasCancelled = cancelled;
      start = null;
      cancelled = false;
      const touch = event.changedTouches?.[0];
      if (!tap || !wasCancelled || !touch) return;
      if (Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) >= TAP_SLOP_PX) return;
      router.push(tap.href);
    };
    root.addEventListener("pointerdown", onPointerDown, { passive: true });
    root.addEventListener("pointercancel", onPointerCancel, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("touchend", onTouchEnd);
    };
  }, [list, router]);
}

/** Emerald and pulsing for today. Zinc and still for every other window. */
export function FreshnessDot({ day, still = false }: { day: boolean; still?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-live-dot={day ? "day" : "week"}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${day ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500"} ${
        day && !still ? DOT_PULSE : ""
      }`}
    />
  );
}

/** "LIVE · Updated 12m ago". Empty until the client knows the time. */
export function Freshness({
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

/** Neutral, never a percent: a card added in the last two weeks. */
export function NewChip() {
  return (
    <span
      data-new-chip=""
      className="inline-flex shrink-0 items-center rounded-full bg-zinc-500/15 px-1.5 py-0.5 font-mono text-[9px] leading-[14px] font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-300"
    >
      New
    </span>
  );
}

export function MoverTile({
  sale,
  index,
  variant,
  animate = false,
  prefetch = false,
  className = "",
  style,
}: {
  sale: MovingTodaySale;
  index: number;
  /** Prefetch when on screen. Only tiles in the first view do, so a swipe or scroll fetches nothing. */
  prefetch?: boolean;
  /** Top is the rail's first, wider tile. Its glow and badge are for a mover only. */
  variant: "top" | "rail" | "grid";
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const rail = variant !== "grid";
  const mover = sale.kind === "mover";
  const lead = variant === "top";
  const badge = lead && mover ? moveBadgeText(sale.percent) : "";
  const gain = moverGain(sale);
  return (
    <CardTile
      card={moverTileCard(sale)}
      href={sale.href}
      // The first three load eagerly. The rest wait for the scroll.
      index={rail ? (index < 3 ? index : index + EAGER_TILES) : index}
      ariaLabel={moverAccessibleName(sale)}
      priceLabel={sale.priceLabel || null}
      gain={gain}
      chip={!mover && sale.isNew ? <NewChip /> : null}
      prefetch={prefetch}
      as="li"
      density="compact"
      countUp={rail && animate && index < STAGGER_TILES}
      sizes={rail ? "120px" : "(min-width: 640px) 170px, 50vw"}
      className={
        rail
          ? `shrink-0 snap-start ${lead ? `${RAIL_TOP_WIDTH} ${mover ? TOP_GLOW : ""}` : RAIL_TILE_WIDTH} ${
              index >= RAIL_PAINTED_TILES ? OFFSCREEN_TILE : ""
            } ${animate && index < STAGGER_TILES ? ENTER : ""}`
          : `min-w-0 ${className}`
      }
      style={rail ? (animate ? { animationDelay: `${index * STAGGER_MS}ms` } : undefined) : style}
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
      {rail || !mover || !sale.soldLabel ? null : (
        <p className="px-1.5 pb-1 text-[11px] leading-4 text-zinc-500">Sold {sale.soldLabel}</p>
      )}
    </CardTile>
  );
}

const RAIL_LIST =
  "flex snap-x snap-mandatory scroll-px-4 items-end gap-2.5 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden after:w-1.5 after:shrink-0 after:content-['']";

/**
 * Home movers: one line of header, then a swipeable row of shared card tiles,
 * biggest move first, then the newest public cards, ending in "See all N"
 * when there are more than fit. The quiet row shows only with no cards at all.
 */
export function MovingTodayPanel({ payload }: { payload: MovingTodayPayload }) {
  const [animate] = useState(() => !railEntered);
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  useTapThroughDrift(list);
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

  const sales = shouldShowMovingToday(payload.sales) ? payload.sales : [];
  if (sales.length === 0) return <MovingQuiet />;
  const total = sales.length;
  const shown = sales.slice(0, expanded ? MOVING_RAIL_COUNT : RAIL_FIRST_TILES);
  const day = payload.window === "day";
  const range =
    payload.window === "week" || payload.window === "month" ? compactRangeLabel(payload.dateLabel) : "";

  return (
    <section
      aria-label={payload.title}
      data-moving-today=""
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
          aria-label={`See all ${total} cards`}
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
            prefetch={index < RAIL_PREFETCH_TILES}
          />
        ))}
        {total > MOVING_RAIL_COUNT ? (
          <li
            className={`${RAIL_TILE_WIDTH} shrink-0 snap-start self-stretch p-1 ${OFFSCREEN_TILE}`}
          >
            <Link
              href={MOVING_TODAY_PATH}
              prefetch={false}
              data-see-all-tile=""
              className={`flex h-full min-h-44 flex-col items-center justify-center gap-1 rounded-[10px] bg-zinc-100 text-center transition-transform duration-150 ease-out motion-safe:active:scale-[0.97] dark:bg-white/[0.04] ${tileFocusRing}`}
            >
              <span className={`text-[13px] ${SEE_ALL_LINK}`}>See all {total}</span>
              <ChevronRight aria-hidden className="h-4 w-4 text-zinc-400" />
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** No public cards at all: one slim row, the header's height, no tiles. */
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

/**
 * Client fallback when the server read failed. A sized skeleton holds the
 * spot. If the answer is the quiet row or nothing, the skeleton's box stays
 * and the row fades in inside it, so nothing below moves.
 */
export function MovingToday() {
  const [view, setView] = useState<MovingTodayPayload | "loading" | null>("loading");
  const [hold, setHold] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const settle = (next: MovingTodayPayload | null) => {
      if (!next || !shouldShowMovingToday(next.sales)) setHold(box.current?.offsetHeight || null);
      setView(next);
    };
    void (async () => {
      try {
        const response = await fetch("/api/moving-today", { signal: controller.signal });
        if (!response.ok) throw new Error("Moving today unavailable");
        const payload = freshenMovingToday((await response.json()) as MovingTodayPayload);
        if (cancelled) return;
        settle(payload);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        settle(null);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return (
    <div
      ref={box}
      data-moving-hold={hold ? "" : undefined}
      style={hold ? { minHeight: hold } : undefined}
    >
      {view === "loading" ? (
        <MovingTodaySkeleton />
      ) : hold ? (
        <div className={FADE_IN}>{view ? <MovingTodayPanel payload={view} /> : null}</div>
      ) : view ? (
        <MovingTodayPanel payload={view} />
      ) : null}
    </div>
  );
}
