"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 68;
const HOLD = 44;
const TOUCH_OR_NARROW = "(max-width: 767px), (pointer: coarse)";

function blockedTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, textarea, select, button, a, [role='button'], [role='dialog'], [data-no-pull]",
      ),
    )
  );
}

function usePullEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(TOUCH_OR_NARROW);
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return enabled;
}

/**
 * Pull down at the top of the page to reload.
 * onRefresh re-reads the current store (local browser data, or Supabase when configured).
 * Shown only on touch devices or small screens — hidden on desktop with a fine pointer.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false,
  className,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pullEnabled = usePullEnabled();
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const distanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  const refreshingRef = useRef(false);
  const enabledRef = useRef(pullEnabled);
  const mounted = useRef(true);
  onRefreshRef.current = onRefresh;
  disabledRef.current = disabled;
  enabledRef.current = pullEnabled;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pullEnabled) {
      tracking.current = false;
      distanceRef.current = 0;
      setDragging(false);
      setDistance(0);
      return;
    }

    function arm(clientX: number, clientY: number) {
      if (
        !enabledRef.current ||
        disabledRef.current ||
        refreshingRef.current ||
        window.scrollY > 4
      ) {
        return false;
      }
      startX.current = clientX;
      startY.current = clientY;
      tracking.current = true;
      return true;
    }

    function move(clientX: number, clientY: number) {
      if (!tracking.current || refreshingRef.current) return 0;
      if (window.scrollY > 4) {
        tracking.current = false;
        distanceRef.current = 0;
        setDragging(false);
        setDistance(0);
        return 0;
      }
      const dx = clientX - startX.current;
      const dy = clientY - startY.current;
      if (dy <= 0) {
        distanceRef.current = 0;
        setDistance(0);
        return 0;
      }
      if (Math.abs(dx) > dy) {
        tracking.current = false;
        distanceRef.current = 0;
        setDragging(false);
        setDistance(0);
        return 0;
      }
      const next = Math.min(dy * 0.45, 92);
      distanceRef.current = next;
      setDragging(true);
      setDistance(next);
      return next;
    }

    function finish() {
      if (!tracking.current) return;
      const pulled = distanceRef.current;
      tracking.current = false;
      setDragging(false);
      if (pulled < THRESHOLD || refreshingRef.current) {
        distanceRef.current = 0;
        setDistance(0);
        return;
      }
      distanceRef.current = 0;
      refreshingRef.current = true;
      setRefreshing(true);
      setDistance(HOLD);
      const started = Date.now();
      Promise.resolve(onRefreshRef.current())
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
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (blockedTarget(event.target)) return;
      arm(event.clientX, event.clientY);
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      move(event.clientX, event.clientY);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || blockedTarget(event.target)) return;
      const touch = event.touches[0];
      arm(touch.clientX, touch.clientY);
    }

    function onTouchMove(event: TouchEvent) {
      if (!tracking.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const next = move(touch.clientX, touch.clientY);
      if (next > 6 && event.cancelable) event.preventDefault();
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finish);
    window.addEventListener("touchcancel", finish);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
    };
  }, [pullEnabled]);

  const shown = pullEnabled ? (refreshing ? HOLD : distance) : 0;

  return (
    <div className={className}>
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
            refreshing ? undefined : { transform: `rotate(${Math.min(distance / THRESHOLD, 1) * 280}deg)` }
          }
        >
          <span className="sr-only">{refreshing ? "Refreshing" : "Pull to refresh"}</span>
        </span>
      </div>
      {children}
    </div>
  );
}
