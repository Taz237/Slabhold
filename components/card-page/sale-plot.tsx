"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ScrubState } from "@/components/charts/value-chart-scrub";
import { buildSalePlot, nearestDot } from "@/lib/chart/sale-plot";
import type { ChartSale } from "@/lib/chart/sales";
import { money } from "@/lib/format";
import { afterFirstIdle } from "@/lib/ui/idle";

/**
 * The card page's sales chart. A purple line through the real sales in
 * straight segments, a soft fill under it, and one dot per sale. The current
 * value is one dashed line. Tap or drag to read a sale; the press, drag, key
 * and haptic handling is the shared scrub chunk (charts/value-chart-scrub).
 * SVG, no chart library.
 */

export const SALE_PLOT_HEIGHT = 208;
/** On screen from here: the line draws in, once. */
const SEEN = 0.35;

type ScrubModule = typeof import("@/components/charts/value-chart-scrub");

let scrubModule: ScrubModule | null = null;
let scrubLoad: Promise<ScrubModule> | null = null;

function loadScrub(): Promise<ScrubModule> {
  scrubLoad ??= import("@/components/charts/value-chart-scrub").then(
    (module) => (scrubModule = module),
    (error: unknown) => {
      scrubLoad = null;
      throw error;
    },
  );
  return scrubLoad;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Draw = "wait" | "play" | "done";

export function SalePlot({
  sales,
  hollowIds,
  value = null,
  selectedId = null,
  onSelect,
  ariaLabel,
  height = SALE_PLOT_HEIGHT,
  width: fixedWidth,
  drawKey = "",
}: {
  /** The real sales. One dot each. */
  sales: readonly ChartSale[];
  /** Outliers: hollow dots, off the line. */
  hollowIds?: ReadonlySet<string>;
  /** The headline value, marked once with a dashed line. */
  value?: number | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  ariaLabel: string;
  height?: number;
  /** A set width (tests, share renders). Measured when left out. */
  width?: number;
  /** Changes with the range, so the marks fade in again. */
  drawKey?: string;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const [draw, setDraw] = useState<Draw>(() =>
    typeof IntersectionObserver === "undefined" || reducedMotion() ? "done" : "wait",
  );
  const pressed = useRef(false);
  const frame = useRef(0);
  const activeRef = useRef<number | null>(null);
  const lastTick = useRef(0);
  const held = useRef<((module: ScrubModule) => void)[]>([]);

  useEffect(() => {
    const node = box.current;
    if (fixedWidth != null || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setMeasured((current) => (current === next ? current : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fixedWidth]);

  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry?.isIntersecting && entry.intersectionRatio >= SEEN * 0.99) {
          setDraw((current) => (current === "wait" ? "play" : current));
          observer.disconnect();
        }
      },
      { threshold: [0, SEEN] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plot = useMemo(
    () => (width > 0 ? buildSalePlot({ sales, hollow: hollowIds, value, width, height }) : null),
    [sales, hollowIds, value, width, height],
  );
  const dots = plot?.dots;
  const selectedIndex = dots && selectedId ? dots.findIndex((dot) => dot.sale.id === selectedId) : -1;
  const shown = selectedIndex >= 0 && dots ? dots[selectedIndex] : null;

  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);
  // The scrub chunk writes the tooltip: redraw once it is in.
  const [, setScrubReady] = useState(Boolean(scrubModule));
  useEffect(() => afterFirstIdle(() => void loadScrub().then(() => setScrubReady(true), () => {})), []);

  // The scrub chunk picks by x. Here x is the dot's place in line, so the chart can pick in two dimensions first.
  const scrubState = useRef<ScrubState | null>(null);
  useLayoutEffect(() => {
    scrubState.current = {
      xs: (dots ?? []).map((_, index) => index),
      withDots: true,
      selectedIndex,
      pressed,
      frame,
      activeRef,
      lastTick,
      select: (index) => {
        if (activeRef.current === index) return;
        activeRef.current = index;
        onSelect?.(index == null ? null : (dots?.[index]?.sale.id ?? null));
      },
    };
    activeRef.current = selectedIndex >= 0 ? selectedIndex : null;
  });

  function scrub(call: (module: ScrubModule, state: ScrubState) => void) {
    const run = (module: ScrubModule) => {
      if (scrubState.current) call(module, scrubState.current);
    };
    if (scrubModule) {
      run(scrubModule);
      return;
    }
    held.current.push(run);
    void loadScrub().then(
      (module) => {
        const calls = held.current;
        held.current = [];
        for (const replay of calls) replay(module);
        setScrubReady(true);
      },
      () => {
        held.current = [];
      },
    );
  }

  function preloadScrub() {
    if (!scrubModule) void loadScrub().catch(() => {});
  }

  function dotAt(event: { clientX: number; clientY: number; currentTarget: Element }): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return dots ? nearestDot(dots, event.clientX - rect.left, event.clientY - rect.top) : -1;
  }

  const drawing = draw !== "done" && !reducedMotion();
  const lone = dots?.length === 1 ? dots[0] : null;
  const tip =
    shown && plot && scrubModule
      ? scrubModule.chartTip({
          x: shown.x,
          y: shown.y,
          plotRight: plot.plotRight,
          value: shown.sale.price,
          date: shown.sale.date,
          marker: shown.sale.grade ?? null,
          dateOnly: false,
        })
      : null;

  return (
    <div
      ref={box}
      data-sale-plot=""
      data-no-pull=""
      className="chart-surface relative w-full select-none text-violet-600 dark:text-violet-400"
      // The plot sits straight on the page, so dot rings take the page's color.
      style={{ height, ["--chart-surface" as string]: "var(--background)" }}
    >
      {plot && dots ? (
        <svg
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block cursor-crosshair overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          style={{ touchAction: "pan-y", WebkitTapHighlightColor: "transparent" }}
          onPointerEnter={preloadScrub}
          onFocus={preloadScrub}
          onPointerDown={(event) => {
            pressed.current = true;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Synthetic events in tests have no live pointer.
            }
            const index = dotAt(event);
            const { pointerType } = event;
            if (index >= 0) scrub((module, state) => module.pressAt(state, index, pointerType));
          }}
          onPointerMove={(event) => {
            if (!pressed.current) return;
            const index = dotAt(event);
            const { pointerType } = event;
            if (index >= 0) scrub((module, state) => module.scrubTo(state, index, pointerType));
          }}
          onPointerUp={() => scrub((module, state) => module.release(state))}
          onPointerCancel={() => scrub((module, state) => module.release(state))}
          onKeyDown={(event) => {
            const { key } = event;
            if (key === "ArrowRight" || key === "ArrowLeft") event.preventDefault();
            if (key === "ArrowRight" || key === "ArrowLeft" || key === "Escape") {
              scrub((module, state) => module.keyDown(state, key));
            }
          }}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="0.65" stopColor="currentColor" stopOpacity={0.08} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>

          <g key={`axis-${drawKey}`} className="chart-fade">
            {plot.ticks.map((tick) => (
              <g key={tick.label}>
                <line x1={0} x2={plot.plotRight} y1={tick.y} y2={tick.y} className="chart-grid" strokeWidth={1} />
                <text x={width} y={tick.y} dy="0.32em" textAnchor="end" className="chart-tick text-[0.6875rem] tabular-nums">
                  {tick.label}
                </text>
              </g>
            ))}
            {plot.dates.map((date) => (
              <text
                key={`${date.label}-${date.anchor}`}
                x={date.x}
                y={height - 6}
                textAnchor={date.anchor}
                className="chart-tick text-[0.6875rem] tabular-nums"
              >
                {date.label}
              </text>
            ))}
          </g>

          {plot.value ? (
            <g data-sale-value="" pointerEvents="none">
              <line
                x1={0}
                x2={plot.plotRight}
                y1={plot.value.y}
                y2={plot.value.y}
                stroke="currentColor"
                strokeOpacity={0.55}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text
                x={width}
                y={plot.value.y}
                dy="0.32em"
                textAnchor="end"
                fill="currentColor"
                className="text-[0.6875rem] font-medium tabular-nums"
              >
                {plot.value.label}
              </text>
            </g>
          ) : null}

          {plot.area ? (
            <path
              d={plot.area}
              fill={`url(#${id}-fill)`}
              className={drawing ? (draw === "play" ? "chart-draw-fill" : "chart-draw-fill-wait") : undefined}
              onAnimationEnd={() => setDraw("done")}
            />
          ) : null}
          {plot.line ? (
            <path
              data-sale-line=""
              d={plot.line}
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={drawing ? (draw === "play" ? "chart-draw" : "chart-draw-wait") : undefined}
            />
          ) : null}

          <g
            key={`dots-${drawKey}`}
            className={draw === "wait" && drawing ? "opacity-0" : "chart-fade"}
            style={draw === "play" ? { animationDelay: "180ms" } : undefined}
          >
            {dots.map((dot, index) => {
              const on = index === selectedIndex;
              return (
                <circle
                  key={dot.sale.id}
                  data-sale-dot={dot.hollow ? "outlier" : "sale"}
                  cx={dot.x}
                  cy={dot.y}
                  r={on ? 6 : lone ? 5 : 4}
                  fill={dot.hollow ? "var(--chart-surface)" : "currentColor"}
                  stroke={dot.hollow ? "currentColor" : "var(--chart-surface)"}
                  strokeWidth={dot.hollow ? 1.5 : 2}
                />
              );
            })}
            {lone && !shown ? (
              <text
                data-sale-label=""
                x={lone.x}
                y={lone.y - 14}
                textAnchor="middle"
                className="fill-zinc-900 text-[0.8125rem] font-semibold tabular-nums dark:fill-zinc-50"
              >
                {money(lone.sale.price)}
              </text>
            ) : null}
          </g>

          {shown ? (
            <g pointerEvents="none">
              <line
                x1={shown.x}
                x2={shown.x}
                y1={plot.top - 6}
                y2={plot.bottom}
                className="stroke-zinc-300 dark:stroke-zinc-700"
                strokeWidth={1}
              />
              <circle cx={shown.x} cy={shown.y} r={9} fill="currentColor" fillOpacity={0.18} />
              <circle
                cx={shown.x}
                cy={shown.y}
                r={5}
                fill={shown.hollow ? "var(--chart-surface)" : "currentColor"}
                stroke={shown.hollow ? "currentColor" : "var(--chart-surface)"}
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
      ) : null}
      {tip ? (
        <div
          aria-hidden="true"
          data-chart-tip=""
          className="chart-tip pointer-events-none absolute top-0 left-0 flex h-[22px] items-center justify-center rounded-full text-xs font-medium whitespace-nowrap tabular-nums"
          style={{ width: tip.w, transform: `translate(${tip.left}px, ${tip.top}px)` }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
