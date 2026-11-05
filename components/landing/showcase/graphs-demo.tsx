"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ValueChart } from "@/components/charts/value-chart";
import { cancelAll, canAnimate, countUp, dollars, onceVisible, prefersReducedMotion, rise } from "./motion";
import { sampleValueLine } from "./sample-data";

/** The chart's own draw-in. The value counts up alongside it. */
const DRAW_MS = 400;

/**
 * The collection chart: the app's own ValueChart with a sample 90-day line.
 * The chart draws itself in the first time it is on screen (and again on each
 * Replay, which remounts it), and the value counts up to $412 with it. `gain`
 * is the sample gain chip, passed in so its text stays with the landing panels.
 */
export default function GraphsDemo({ run, gain }: { run: number; gain: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [points] = useState(() => sampleValueLine());
  const last = points[points.length - 1].value;
  const stop = useRef<() => void>(() => {});
  const revealed = useRef(false);

  function play() {
    stop.current();
    const node = root.current;
    if (!node || prefersReducedMotion() || !canAnimate(node)) return;
    const animations: (Animation | null)[] = [];
    if (!revealed.current) {
      revealed.current = true;
      animations.push(rise(node));
    }
    let cancelCount = countUp(value.current, points[0].value, last, { duration: DRAW_MS, delay: 0 });

    stop.current = () => {
      cancelAll(animations);
      cancelCount();
      cancelCount = () => {};
    };
  }

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const unwatch = onceVisible(node, () => play());
    return () => {
      unwatch();
      stop.current();
    };
    // play reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (run > 0) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return (
    <div ref={root} data-showcase-demo="graphs" className="h-full rounded-2xl border border-white/[0.08] bg-[#101013] p-4">
      <p className="text-[13px] leading-5 text-zinc-400">Collection value</p>
      <p className="mt-1 text-[34px] leading-10 font-semibold tracking-tight text-white tabular-nums">
        <span ref={value}>{dollars(last)}</span>
      </p>
      <div className="mt-1 flex h-5 items-center gap-2">
        {gain}
        <span className="text-[13px] text-zinc-400">Last 90 days</span>
      </div>
      <div className="mt-4">
        {/* Re-keyed on Replay so the built-in draw-in plays again. Off with reduced motion. */}
        <ValueChart
          key={run}
          points={points}
          tone="accent"
          height={176}
          ariaLabel={`Sample collection value ${dollars(last)}, up $38 in 90 days`}
        />
      </div>
    </div>
  );
}
