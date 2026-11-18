"use client";

import { useEffect, useRef } from "react";

const DURATION_MS = 700;

/**
 * A podium score that counts up once, the first time it is on screen. The
 * server draws the real number, so nothing moves without JS or with Reduce
 * Motion. Only the text changes: no React state, no layout work.
 */
export function LeaderboardCount({ value, className }: { value: number; className?: string }) {
  const node = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = node.current;
    if (!el || value <= 1) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver !== "function") return;
    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / DURATION_MS);
        // Ease out: fast at first, settling on the real number.
        el.textContent = String(Math.round(value * (1 - (1 - t) ** 3)));
        if (t < 1) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      el.textContent = String(value);
    };
  }, [value]);

  return (
    <span ref={node} className={className}>
      {value}
    </span>
  );
}
