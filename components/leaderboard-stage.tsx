"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Layers, MessageCircle, TrendingUp } from "lucide-react";
import { LeaderboardSheet, type SheetPerson } from "@/components/leaderboard-sheet";
import { rankShareLink } from "@/lib/leaderboard/hooks";
import { haptic } from "@/lib/ios/haptics";
import { clearPendingNav } from "@/lib/ui/tap-feedback";

const BOARD_ICON: Record<string, typeof Layers> = {
  "top-card-post": MessageCircle,
  "rising-collectors": TrendingUp,
  "most-cards-added": Layers,
};

/** A sideways drag at least this long, and twice as wide as it is tall, changes board. */
const SWIPE_MIN_PX = 64;
/** Drags that start at the left edge belong to the system's back swipe. */
const EDGE_PX = 24;

/** A light tick where the device has one. Never with Reduce Motion. */
function tick() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof navigator.vibrate === "function") navigator.vibrate(8);
  haptic("tick");
}

/**
 * The boards as tabs: one board on screen, a tap or a sideways swipe for the
 * next. Every board is in the page from the server; this only picks which one
 * shows, keeps `?board=` in step, and opens a collector's sheet when their
 * place or row is tapped. Without JS the tabs are plain links and the rows
 * open the profile.
 */
export function LeaderboardStage({
  tabs,
  initial,
  focus,
  week,
  people,
  children,
}: {
  tabs: readonly { id: string; label: string }[];
  /** The board on screen first: the `?board=` one, or the first in page order. */
  initial: string;
  /** The board a `?board=` link names, or null. A new one moves the tabs to it. */
  focus: string | null;
  week: "current" | "previous";
  /** Sheet data by `data-collector` key. */
  people: Readonly<Record<string, SheetPerson>>;
  children: ReactNode;
}) {
  const [active, setActive] = useState(initial);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const activeRef = useRef(active);

  const go = useCallback(
    (id: string, focusTab = false) => {
      const from = tabs.findIndex((tab) => tab.id === activeRef.current);
      const to = tabs.findIndex((tab) => tab.id === id);
      if (to < 0 || to === from) return;
      activeRef.current = id;
      setDir(to > from ? "next" : "prev");
      setActive(id);
      tick();
      try {
        window.history.replaceState(window.history.state, "", rankShareLink(id, week));
      } catch {
        // A sandboxed frame may refuse history changes. The tab still switches.
      }
      if (focusTab) document.getElementById(`tab-${id}`)?.focus();
    },
    [tabs, week],
  );

  // A `?board=` link opened while the page is up moves to that board.
  useEffect(() => {
    if (!focus || focus === activeRef.current) return;
    activeRef.current = focus;
    setActive(focus);
  }, [focus]);

  // The week toggle's links carry no board. Put the board on screen back in the URL.
  useEffect(() => {
    if (activeRef.current === initial) return;
    try {
      window.history.replaceState(window.history.state, "", rankShareLink(activeRef.current, week));
    } catch {
      // See go().
    }
  }, [initial, week]);

  const close = useCallback(() => {
    setOpen(null);
    const from = opener.current;
    opener.current = null;
    // After the sheet is gone, so focus lands on a row that is back in the tab order.
    window.setTimeout(() => from?.focus(), 0);
  }, []);

  // A tap on a place or a row opens that collector's sheet. Modified clicks keep the link.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const hit = (event.target as Element | null)?.closest?.<HTMLElement>("[data-collector]");
      const key = hit?.dataset.collector;
      if (!hit || !key || !people[key]) return;
      event.preventDefault();
      // The tap opens a sheet, not the profile: drop the profile skeleton the press started.
      clearPendingNav(document);
      opener.current = hit;
      setOpen(key);
      tick();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [people]);

  // Sideways swipe between boards. Passive: a vertical scroll is never held back.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (event: TouchEvent) => {
      start = null;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX < EDGE_PX) return;
      if ((event.target as Element | null)?.closest?.("[data-no-swipe], [role='dialog']")) return;
      start = { x: touch.clientX, y: touch.clientY };
    };
    const onEnd = (event: TouchEvent) => {
      const from = start;
      start = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 2) return;
      const at = tabs.findIndex((tab) => tab.id === activeRef.current);
      const next = tabs[at + (dx < 0 ? 1 : -1)];
      if (next) go(next.id);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [go, tabs]);

  function onKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next) go(next.id, true);
  }

  const person = open ? people[open] : null;
  return (
    <div ref={root} data-leaderboard-stage="" data-active-board={active} data-dir={dir}>
      <style>
        {tabs
          .map((tab) => `[data-active-board="${tab.id}"] [data-board]:not(#board-${tab.id}){display:none}`)
          .join("")}
      </style>
      <div
        role="tablist"
        aria-label="Boards"
        data-board-tabs=""
        className="grid gap-1 rounded-2xl bg-black/25 p-1 ring-1 ring-white/10"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, index) => {
          const Icon = BOARD_ICON[tab.id] ?? Layers;
          const selected = tab.id === active;
          return (
            <a
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              href={rankShareLink(tab.id, week)}
              aria-selected={selected}
              aria-controls={`board-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                go(tab.id);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`tap flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-12 leading-[1.15] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${
                selected ? "bg-white/[0.12] text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon aria-hidden="true" className={`h-[18px] w-[18px] ${selected ? "text-[#C4B5FD]" : ""}`} strokeWidth={1.75} />
              <span className="text-balance">{tab.label}</span>
            </a>
          );
        })}
      </div>
      <div data-board-panels="" className="mt-3">
        {children}
      </div>
      {person ? <LeaderboardSheet person={person} onClose={close} /> : null}
    </div>
  );
}
