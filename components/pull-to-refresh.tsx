"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PULL_THRESHOLD_PX,
  onPageRefresh,
  pullPhase,
  shouldClaimPull,
  type PullPhase,
} from "@/lib/ui/pull-refresh";

const HOLD = 40;
const TOUCH = "(pointer: coarse)";

function scrollOffset() {
  const root = document.scrollingElement;
  return root ? root.scrollTop : window.scrollY;
}

function blockedTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, nav, header, [role='dialog'], [data-no-pull]"))
  );
}

/**
 * Touch pull at the top of the page. Calls router.refresh() and onRefresh.
 * Desktop (fine pointer) is left alone. A downward pull that starts at
 * scrollTop 0 is claimed so it does not stack on Safari's rubber-band;
 * every other move is ignored and the browser scrolls or bounces as usual.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false,
  className,
  children,
}: {
  onRefresh?: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  const refreshingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    disabledRef.current = disabled;
  }, [disabled, onRefresh]);

  const run = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setDragging(false);
    setDistance(HOLD);
    const started = Date.now();
    void Promise.all([
      Promise.resolve(router.refresh()),
      Promise.resolve(onRefreshRef.current?.()),
    ])
      .catch(() => undefined)
      .finally(() => {
        const wait = Math.max(0, 650 - (Date.now() - started));
        window.setTimeout(() => {
          refreshingRef.current = false;
          if (!mounted.current) return;
          setRefreshing(false);
          setDistance(0);
        }, wait);
      });
  }, [router]);

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

  useEffect(() => {
    if (!enabled) return;

    let tracking = false;
    let watching = false;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;

    function clearPull() {
      if (refreshingRef.current) return;
      setDragging(false);
      setDistance(0);
    }

    function stopWatching() {
      if (!watching) return;
      watching = false;
      window.removeEventListener("touchmove", onTouchMove);
    }

    function onTouchStart(event: TouchEvent) {
      stopWatching();
      tracking = false;
      deltaX = 0;
      deltaY = 0;
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
      if (!shouldClaimPull(phase)) {
        // Up, sideways, or no longer at the top: let the page scroll and
        // let iOS overscroll bounce. Never cancel that gesture.
        if (deltaY < 0 || scrollOffset() > 0 || Math.abs(deltaX) > Math.max(deltaY, 0)) {
          tracking = false;
          stopWatching();
          clearPull();
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      setDragging(true);
      setDistance(Math.min(deltaY, 88));
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
      setDragging(false);
      if (phase === "refresh") run();
      else clearPull();
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      stopWatching();
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, run]);

  const shown = refreshing ? HOLD : distance;

  return (
    <div className={className}>
      {enabled ? (
        <div
          aria-hidden={shown === 0}
          className="flex items-center justify-center overflow-hidden"
          style={{ height: shown, transition: dragging ? "none" : "height 180ms ease" }}
        >
          <span
            role="status"
            className={`h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-white/20 dark:border-t-zinc-100 ${
              refreshing ? "animate-spin" : ""
            }`}
            style={
              refreshing
                ? undefined
                : { transform: `rotate(${Math.min(distance / PULL_THRESHOLD_PX, 1) * 280}deg)` }
            }
          >
            {refreshing ? <span className="sr-only">Refreshing</span> : null}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
