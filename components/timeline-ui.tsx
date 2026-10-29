"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowUp } from "lucide-react";
import { MentionText } from "@/components/mention-text";
import {
  createLaneScrollMemory,
  createRowHeights,
  entranceDelayMs,
  newItemsAbove,
  shouldCollapseBody,
} from "@/lib/ui/timeline";

export type HomeLane = "foryou" | "following";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/** True when the reader asked for less motion. False on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => Boolean(window.matchMedia?.(REDUCED_MOTION).matches),
    () => false,
  );
}

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** True once the page has scrolled a little. False on the server. */
export function useScrolled(threshold = 4): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > threshold,
    () => false,
  );
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.(REDUCED_MOTION).matches ? "auto" : "smooth";
}

/** Sticks just under the app header. */
export const LANE_TABS_TOP = "top-[calc(env(safe-area-inset-top)+3.8125rem)]";

const LANES: Array<{ id: HomeLane; label: string }> = [
  { id: "foryou", label: "For You" },
  { id: "following", label: "Following" },
];

/** For You / Following: a translucent bar with a violet underline that slides between tabs. */
export function LaneTabs({ lane, onChange }: { lane: HomeLane; onChange: (lane: HomeLane) => void }) {
  const index = LANES.findIndex((item) => item.id === lane);
  const scrolled = useScrolled();

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = LANES[(index + (event.key === "ArrowRight" ? 1 : LANES.length - 1)) % LANES.length];
    onChange(next.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`#lane-tab-${next.id}`)?.focus();
  }

  return (
    <div
      data-lane-tabs=""
      data-scrolled={scrolled ? "true" : "false"}
      className={`sticky ${LANE_TABS_TOP} z-10 border-b backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow,border-color] duration-200 motion-reduce:transition-none ${
        scrolled
          ? "border-zinc-200 bg-[color-mix(in_oklab,var(--background)_72%,transparent)] shadow-[0_10px_24px_-18px_rgba(24,24,27,0.45)] dark:border-white/[0.09] dark:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.9)]"
          : "border-zinc-200/70 bg-[color-mix(in_oklab,var(--background)_82%,transparent)] dark:border-white/[0.07]"
      }`}
    >
      <div role="tablist" aria-label="Home timeline" onKeyDown={onKeyDown} className="relative grid grid-cols-2">
        {LANES.map((item) => {
          const active = item.id === lane;
          return (
            <button
              key={item.id}
              id={`lane-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="home-lane-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={`min-h-12 text-[15px] tracking-tight transition-colors duration-200 hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.03] ${
                active ? "font-bold text-[var(--foreground)]" : "font-medium text-zinc-500"
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <span
          data-lane-underline=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 flex h-[3px] w-1/2 justify-center transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        >
          <span className="block h-full w-14 rounded-full bg-violet-600 dark:bg-violet-500" />
        </span>
      </div>
    </div>
  );
}

/**
 * Switches Home tabs and gives each tab its own scroll spot. `laneTop` is the
 * scroll offset where the tabs start sticking. Tapping the open tab goes to its top.
 */
export function useLaneScroll(
  lane: HomeLane,
  setLane: (lane: HomeLane) => void,
  laneTop: () => number,
): (next: HomeLane) => void {
  const [memory] = useState(createLaneScrollMemory);
  const pending = useRef<number | null>(null);

  useLayoutEffect(() => {
    const top = pending.current;
    pending.current = null;
    if (top !== null && top !== window.scrollY) window.scrollTo(0, top);
  }, [lane]);

  return useCallback(
    (next: HomeLane) => {
      const current = window.scrollY;
      const top = Math.max(0, laneTop());
      if (next === lane) {
        if (current > top) window.scrollTo({ top, behavior: scrollBehavior() });
        return;
      }
      memory.save(lane, current);
      pending.current = memory.target(next, { current, laneTop: top });
      setLane(next);
    },
    [lane, laneTop, memory, setLane],
  );
}

/** The feed item under the sticky tabs, or null when the first item is in view. */
export function readFeedAnchor(): string | null {
  if (typeof document === "undefined") return null;
  const items = document.querySelectorAll<HTMLElement>("[data-feed-key]");
  if (items.length === 0) return null;
  const tabs = document.querySelector("[data-lane-tabs]")?.getBoundingClientRect().bottom ?? 0;
  if (items[0].getBoundingClientRect().top >= tabs) return null;
  for (const item of items) {
    if (item.getBoundingClientRect().bottom > tabs + 8) return item.dataset.feedKey ?? null;
  }
  return null;
}

/**
 * Shows "New posts" when a refresh puts items above the reader's spot. Uses
 * only the items already loaded. The spot is read while the old list is still
 * on screen, so it does not depend on the browser's scroll anchoring.
 */
export function useNewPostsAbove({
  lane,
  keys,
  readAnchor = readFeedAnchor,
}: {
  lane: string;
  keys: readonly string[];
  readAnchor?: () => string | null;
}): { show: boolean; dismiss: () => void } {
  const signature = keys.join("\n");
  const [seen, setSeen] = useState({ lane, signature, keys });
  const [show, setShow] = useState(false);
  if (seen.lane !== lane || seen.signature !== signature) {
    const landed = seen.lane === lane && newItemsAbove(seen.keys, keys, readAnchor()) > 0;
    setSeen({ lane, signature, keys });
    if (landed) setShow(true);
    else if (seen.lane !== lane) setShow(false);
  }

  useEffect(() => {
    if (!show) return;
    function onScroll() {
      if (window.scrollY < 8) setShow(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [show]);

  const dismiss = useCallback(() => setShow(false), []);
  return { show, dismiss };
}

/** Floating "New posts" pill under the tabs. Tapping it goes to the top. */
export function NewPostsPill({ onClick }: { onClick: () => void }) {
  return (
    <div className={`pointer-events-none sticky ${LANE_TABS_TOP} z-10 h-0`}>
      <div className="flex justify-center pt-16">
        <button
          type="button"
          data-new-posts=""
          onClick={() => {
            window.scrollTo({ top: 0, behavior: scrollBehavior() });
            onClick();
          }}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full bg-violet-600 px-4 text-sm font-bold text-white shadow-lg shadow-violet-950/30 ring-1 ring-white/10 transition-transform active:scale-95 motion-safe:animate-[pill-in_260ms_cubic-bezier(0.2,0.7,0.2,1)_both] motion-reduce:transition-none"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
          New posts
        </button>
      </div>
    </div>
  );
}

/**
 * Post text. In the feed, text past about six lines is clamped behind
 * "Show more". The guess is checked against the real layout before paint.
 */
export function PostBody({
  text,
  className = "text-[15px] leading-[1.4]",
  collapsible = true,
}: {
  text: string;
  className?: string;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [measured, setMeasured] = useState<{ text: string; long: boolean } | null>(null);
  const ref = useRef<HTMLParagraphElement>(null);
  const long = collapsible && (measured?.text === text ? measured.long : shouldCollapseBody(text));
  const clamped = long && !expanded;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!collapsible || expanded || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (node.clientHeight === 0) return;
      const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 21;
      const isLong = node.classList.contains("line-clamp-6")
        ? node.scrollHeight > node.clientHeight + 1
        : Math.round(node.scrollHeight / lineHeight) > 6;
      setMeasured((current) =>
        current?.text === text && current.long === isLong ? current : { text, long: isLong },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [collapsible, expanded, text]);

  return (
    <>
      <p
        ref={ref}
        data-post-body=""
        className={`whitespace-pre-wrap break-words text-pretty ${className} ${clamped ? "line-clamp-6" : ""}`}
      >
        <MentionText text={text} />
      </p>
      {clamped ? (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="hit-44 mt-1 text-[15px] font-semibold text-violet-600 hover:underline dark:text-[#A78BFA]"
        >
          Show more
        </button>
      ) : null}
    </>
  );
}

/** Small brand pill above a card on a post: Pickup, PSA 10, Rookie. A grade is a solid purple badge. */
export function PostPill({ label, solid = false }: { label: string; solid?: boolean }) {
  return (
    <span
      data-post-pill=""
      data-grade-badge={solid ? "" : undefined}
      className={`inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-semibold tracking-wider uppercase ${
        solid
          ? "bg-violet-600 text-white shadow-[0_4px_14px_-4px_rgba(124,58,237,0.7)] ring-1 ring-white/15 ring-inset"
          : "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/20 ring-inset dark:bg-violet-500/15 dark:text-[#A78BFA] dark:ring-violet-400/25"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Remembers which feed items were already shown, and gives each new batch a
 * short staggered fade. Only the first few in a batch fade, so long pages never wait.
 */
export function useEntranceDelays(
  keys: readonly string[],
  /** The list was drawn from memory (coming Back): don't replay its entrance. */
  skipFirst = false,
): (key: string) => number | null {
  const signature = keys.join("\n");
  const [state, setState] = useState<{ signature: string; seen: ReadonlySet<string>; delays: ReadonlyMap<string, number> }>(
    () =>
      skipFirst && keys.length > 0
        ? { signature, seen: new Set(keys), delays: new Map() }
        : { signature: "", seen: new Set(), delays: new Map() },
  );
  let current = state;
  if (state.signature !== signature) {
    const fresh = keys.filter((key) => !state.seen.has(key));
    const delays = new Map<string, number>();
    fresh.forEach((key, order) => {
      const delay = entranceDelayMs(order);
      if (delay !== null) delays.set(key, delay);
    });
    current = {
      signature,
      seen: fresh.length ? new Set([...state.seen, ...fresh]) : state.seen,
      delays: fresh.length ? delays : state.delays,
    };
    setState(current);
  }
  const delays = current.delays;
  return (key: string) => delays.get(key) ?? null;
}

const rowHeights = createRowHeights();
let rowObserver: ResizeObserver | null = null;

function observeRow(node: HTMLElement) {
  if (typeof ResizeObserver === "undefined") return () => {};
  rowObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const key = (entry.target as HTMLElement).dataset.feedKey;
      if (key) rowHeights.set(key, entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    }
  });
  const observer = rowObserver;
  observer.observe(node);
  return () => observer.unobserve(node);
}

/**
 * Wraps a feed item with its fade-in. Transform and opacity only, so nothing
 * shifts. Rows off screen skip layout and paint (`feed-row` in globals.css)
 * and hold their last real height, so scrolling and Back stay exact.
 */
export function FeedItem({
  itemKey,
  delay,
  children,
}: {
  itemKey: string;
  delay: number | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? observeRow(ref.current) : undefined), []);
  const style: CSSProperties = { containIntrinsicSize: `auto ${rowHeights.get(itemKey)}px` };
  if (delay) style.animationDelay = `${delay}ms`;
  return (
    <div
      ref={ref}
      data-feed-key={itemKey}
      className={
        delay === null ? "feed-row" : "feed-row motion-safe:animate-[feed-in_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      }
      style={style}
    >
      {children}
    </div>
  );
}

/** Horizontal rail of cards that snaps, with the next card peeking in. */
export function SnapRail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      data-snap-rail=""
      data-no-pull=""
      role="list"
      aria-label={label}
      className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
