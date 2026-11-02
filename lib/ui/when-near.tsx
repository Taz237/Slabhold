"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** How far outside the viewport a deferred part mounts, so it's in before it scrolls into view. */
export const NEAR_MARGIN_PX = 200;

/** With no IntersectionObserver, a deferred part mounts once the page is idle, or after this at most. */
export const NEAR_IDLE_TIMEOUT_MS = 2000;

type IdleWindow = {
  requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Calls `onNear` once, when `node` comes within `margin` px of the viewport.
 * Without IntersectionObserver it calls it when the browser is idle (or after
 * NEAR_IDLE_TIMEOUT_MS), and without that on the next task. Returns a stop.
 */
export function watchNear(node: Element, onNear: () => void, margin = NEAR_MARGIN_PX): () => void {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    onNear();
  };
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        fire();
      },
      { rootMargin: `${margin}px 0px ${margin}px 0px` },
    );
    observer.observe(node);
    return () => {
      done = true;
      observer.disconnect();
    };
  }
  const idle = globalThis as IdleWindow;
  if (typeof idle.requestIdleCallback === "function") {
    const handle = idle.requestIdleCallback(fire, { timeout: NEAR_IDLE_TIMEOUT_MS });
    return () => {
      done = true;
      idle.cancelIdleCallback?.(handle);
    };
  }
  const timer = setTimeout(fire, 1);
  return () => {
    done = true;
    clearTimeout(timer);
  };
}

/**
 * A below-the-fold part that mounts only when it scrolls near the viewport.
 * Until then it draws `fallback` (the part's own skeleton, or nothing), the
 * same on the server and in the first client render, so hydration matches.
 * The wrapping div carries `className` in both states, so nothing moves.
 */
export function WhenNear({
  children,
  fallback = null,
  className,
  margin = NEAR_MARGIN_PX,
}: {
  children?: ReactNode;
  fallback?: ReactNode;
  className?: string;
  margin?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (near || !node) return;
    return watchNear(node, () => setNear(true), margin);
  }, [near, margin]);

  return (
    // IntersectionObserver needs a box to watch, and it stays in both states so nothing moves.
    <div ref={ref} className={className}>
      {near ? children : fallback}
    </div>
  );
}
