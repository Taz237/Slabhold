"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import {
  PULL_HOLD_PX,
  PULL_THRESHOLD_PX,
  crossedTrigger,
  onPageRefresh,
  pullPhase,
  pullProgress,
  rubberBand,
  shouldStartPull,
  type PullPhase,
} from "@/lib/ui/pull-refresh";

const TOUCH = "(pointer: coarse)";
const REDUCED = "(prefers-reduced-motion: reduce)";
/** The spinner shows at least this long, so a fast refresh still reads as one. */
const MIN_SPIN_MS = 500;
const SETTLE = "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease-out";
const MARK = 36;
/** Arc length of the ring around the mark (r = 16). */
const RING = 2 * Math.PI * 16;

function scrollOffset() {
  const root = document.scrollingElement;
  return root ? root.scrollTop : window.scrollY;
}

function blockedTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, textarea, select, nav, header, [role='dialog'], [role='listbox'], [data-no-pull]",
      ),
    )
  );
}

/**
 * Touch pull at the top of the page. Calls router.refresh() and onRefresh.
 * Desktop (fine pointer) is left alone. A downward pull that starts at
 * scrollTop 0 is claimed; every other move is ignored and the browser
 * scrolls as usual. The pull moves with transform only: a rubber band on
 * the way down, a purple ring that fills around the Slabhold mark, one
 * small pop at the trigger, a hold while loading, then a settle back up.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false,
  className,
  children,
}: {
  onRefresh?: () => Promise<unknown> | void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  const refreshingRef = useRef(false);
  const mounted = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const spinnerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    disabledRef.current = disabled;
  }, [disabled, onRefresh]);

  /** Moves the page and the mark. Only transform and opacity change. */
  const paint = useCallback((offset: number, progress: number, animate: boolean, armed = false) => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    const ring = ringRef.current;
    const spinner = spinnerRef.current;
    const transition = animate ? SETTLE : "none";
    if (content) {
      content.style.transition = transition;
      content.style.transform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : "";
    }
    if (indicator) {
      indicator.style.transition = transition;
      indicator.style.transform = `translate3d(0, ${offset - MARK - 8}px, 0)`;
      indicator.style.opacity = offset > 0 ? String(Math.min(1, 0.25 + progress)) : "0";
    }
    // The ring turns and fills with the pull. The mark itself never rotates.
    if (spinner && !refreshingRef.current) spinner.style.rotate = `${progress * 270 - 90}deg`;
    if (ring && !refreshingRef.current) {
      // Past the trigger the ring closes: let go to refresh.
      ring.style.strokeDashoffset = armed ? "0" : String(RING * (1 - progress * 0.82));
    }
  }, []);

  const run = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    paint(PULL_HOLD_PX, 1, true);
    const started = Date.now();
    void Promise.all([
      Promise.resolve(router.refresh()),
      Promise.resolve(onRefreshRef.current?.()),
    ])
      .catch(() => undefined)
      .finally(() => {
        const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
        window.setTimeout(() => {
          refreshingRef.current = false;
          if (!mounted.current) return;
          setRefreshing(false);
          paint(0, 0, true);
        }, wait);
      });
  }, [paint, router]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => onPageRefresh(run), [run]);

  useEffect(() => {
    const mq = window.matchMedia(TOUCH);
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Ours replaces the browser's own pull-to-refresh, only on screens that have one.
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    return () => {
      root.style.overscrollBehaviorY = before;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let tracking = false;
    let watching = false;
    let pulling = false;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let lastDeltaY = 0;
    let frame = 0;

    function draw() {
      frame = 0;
      paint(rubberBand(deltaY), pullProgress(deltaY), false, deltaY >= PULL_THRESHOLD_PX);
    }

    function clearPull() {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (refreshingRef.current) return;
      if (pulling) paint(0, 0, true);
      pulling = false;
    }

    function click() {
      const mark = markRef.current;
      if (mark && !window.matchMedia(REDUCED).matches) {
        mark.animate?.(
          [{ scale: "1" }, { scale: "1.22" }, { scale: "1" }],
          { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
      // A light tick where the device has one. iOS Safari has none; the pop is the cue.
      if (typeof navigator.vibrate === "function") navigator.vibrate(8);
    }

    function stopWatching() {
      if (!watching) return;
      watching = false;
      window.removeEventListener("touchmove", onTouchMove);
    }

    function onTouchStart(event: TouchEvent) {
      stopWatching();
      tracking = false;
      pulling = false;
      deltaX = 0;
      deltaY = 0;
      lastDeltaY = 0;
      if (event.touches.length !== 1 || disabledRef.current || refreshingRef.current) return;
      if (blockedTarget(event.target)) return;
      // Only a gesture that starts at the top can refresh. Other touches
      // never get a non-passive listener, so normal scrolling stays native.
      if (scrollOffset() > 0) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
      watching = true;
      window.addEventListener("touchmove", onTouchMove, { passive: false });
    }

    function onTouchMove(event: TouchEvent) {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      deltaX = touch.clientX - startX;
      deltaY = touch.clientY - startY;
      const phase: PullPhase = pullPhase({
        touch: true,
        scrollTop: scrollOffset(),
        deltaX,
        deltaY,
        refreshing: refreshingRef.current,
      });
      if (!shouldStartPull(phase, deltaY)) {
        // Up, sideways, a tiny wobble, or no longer at the top: let the
        // page scroll. Never cancel that gesture.
        if (deltaY < 0 || scrollOffset() > 0 || Math.abs(deltaX) > Math.max(deltaY, 0)) {
          tracking = false;
          stopWatching();
          clearPull();
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      pulling = true;
      if (crossedTrigger(lastDeltaY, deltaY)) click();
      lastDeltaY = deltaY;
      if (!frame) frame = window.requestAnimationFrame(draw);
    }

    function onTouchEnd() {
      stopWatching();
      if (!tracking) return;
      const phase = pullPhase({
        touch: true,
        scrollTop: scrollOffset(),
        deltaX,
        deltaY,
        refreshing: refreshingRef.current,
      });
      tracking = false;
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (pulling && phase === "refresh") run();
      else clearPull();
      pulling = false;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      stopWatching();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, paint, run]);

  return (
    <div className={`relative ${className ?? ""}`}>
      {enabled ? (
        <div
          ref={indicatorRef}
          aria-hidden={!refreshing}
          className="pointer-events-none absolute top-0 left-1/2 z-[15] -ml-[18px] h-9 w-9 opacity-0"
          style={{ transform: `translate3d(0, ${-MARK - 8}px, 0)` }}
        >
          <span
            ref={markRef}
            role="status"
            className="relative grid h-9 w-9 place-items-center rounded-full bg-white shadow-[0_6px_18px_-6px_rgba(91,33,182,0.55)] ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-white/10"
          >
            <svg
              ref={spinnerRef}
              viewBox="0 0 36 36"
              aria-hidden="true"
              className={`absolute inset-0 h-9 w-9 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
              style={{ rotate: "-90deg" }}
            >
              <circle
                ref={ringRef}
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="#7C3AED"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING}
              />
            </svg>
            <Logo className="h-5 w-5" />
            {refreshing ? <span className="sr-only">Refreshing</span> : null}
          </span>
        </div>
      ) : null}
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
