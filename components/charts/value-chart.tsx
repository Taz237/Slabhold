"use client";

import type { ChartPoint } from "@/components/charts/value-spark";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { money } from "@/lib/format";
import { athIndex, dateTicks, toDayMs, xScale, yScale } from "@/lib/chart/geometry";
import {
  areaPath,
  downsample,
  linePath,
  monotonePath,
  resampleY,
  type XY,
} from "@/lib/chart/path";
import { axisLabels, valueScale } from "@/lib/chart/scale";
import { FillStops, TONE_CLASS, ValueSpark, type ChartTone } from "@/components/charts/value-spark";
import { CHART } from "@/lib/chart/theme";
import type { ChartLayers, LayerGeom } from "@/components/charts/median-layer";
import type { ScrubState } from "@/components/charts/value-chart-scrub";
import { afterFirstIdle } from "@/lib/ui/idle";

export type { ChartPoint } from "@/components/charts/value-spark";

/** A sale drawn as a dot. Hollow dots are outliers left out of the line. */
export type ChartDot = { id: string; date: string; value: number; hollow?: boolean };

export type { ChartTone } from "@/components/charts/value-spark";

/** Points per range, at most. */
export const MAX_CHART_POINTS = 120;

const MORPH_MS = 250;
const MORPH_SAMPLES = 96;
const TOP = 22;
const BOTTOM = 24;
const GUTTER = 44;

/** 3 dates from this width, else 2. */
const WIDE = 360;
/** Sales this close to the line sit on it. */
const SNAP_PX = 6;
const PILL_CLEAR = 12;
/** On screen from here: draws in, pulses. */
const SEEN = 0.35;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type ScrubModule = typeof import("@/components/charts/value-chart-scrub");

let scrubModule: ScrubModule | null = null;
let scrubLoad: Promise<ScrubModule> | null = null;

/** Press, drag and key handling, from its own chunk: fetched at the first idle moment or first touch. */
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

type Props = {
  points: ChartPoint[];
  /** Summary for screen readers: "Collection value $285.00, up 595% past 30 days". */
  ariaLabel: string;
  tone: ChartTone;
  /** "spark" is a small line with no axes and no scrub. */
  variant?: "full" | "spark";
  height?: number;
  curve?: "monotone";
  /** Changes when the range changes, so the line morphs instead of jumping. */
  morphKey?: string;
  /** Scrubbed point, or null on release. */
  onScrub?: (point: ChartPoint | null) => void;
  /** A quiet "ATH $285" over the highest point. */
  showAth?: boolean;
  /** Sales as dots. With dots, a scrub or tap picks a dot instead of a line point. */
  dots?: ChartDot[];
  selectedDotId?: string | null;
  onSelectDot?: (id: string | null) => void;
  /** "Median $34.99", drawn by `layers`. */
  refLine?: { value: number; label: string } | null;
  /** The middle half of sales, drawn by `layers`. */
  band?: { low: number; high: number } | null;
  /** medianLayers, from the comp chart's chunk. */
  layers?: (geom: LayerGeom) => ChartLayers;
  /** Smallest y span. */
  minSpan?: number;
  /** Tooltip: "$212.49 · Oct 9", or the date alone (the default with `onScrub`). */
  tooltip?: "value" | "date";
  /** Kept for callers; one look for all. */
  minimal?: boolean;
  className?: string;
};

type Geometry = {
  plotRight: number;
  bottom: number;
  xy: (XY & { point: ChartPoint })[];
  line: string;
  area: string;
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
  dots: (XY & { dot: ChartDot })[];
  ath: number;
  base: { x: number; y: number } | null;
  ref: { y: number; label: string } | null;
  band: { y: number; h: number } | null;
};

function build(
  points: ChartPoint[],
  dots: ChartDot[],
  width: number,
  height: number,
  refLine: Props["refLine"],
  band: Props["band"],
  minSpan: number | undefined,
): Geometry | null {
  const series = downsample(
    points.map((point) => ({ ...point, t: toDayMs(point.date) })),
    MAX_CHART_POINTS,
  );
  const dotTimes = dots.map((dot) => ({ dot, t: toDayMs(dot.date) }));
  if (!series.length && !dotTimes.length) return null;
  const values = [
    ...series.map((point) => point.value),
    // Outliers stay off the scale so they cannot flatten the real sales. They pin to the edge.
    ...dots.filter((dot) => !dot.hollow).map((dot) => dot.value),
    ...(refLine ? [refLine.value] : []),
    ...(band ? [band.low, band.high] : []),
  ];
  const scale = valueScale(values, { minSpan });
  const times = [...series.map((point) => point.t), ...dotTimes.map((item) => item.t)];
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const plotRight = Math.max(width - GUTTER, 40);
  const bottom = height - BOTTOM;
  const edge = dots.length ? 6 : 0;
  const x = xScale(t0, t1, edge, plotRight - edge);
  const y = yScale(scale.domain, TOP, bottom);
  const xy = series.map((point) => ({ x: x(point.t), y: y(point.value), point }));
  const line = xy.length > 1 ? monotonePath(xy) : "";
  const labels = axisLabels(scale.ticks);
  const xTicks = dateTicks(t0, t1, width >= WIDE ? 3 : 2).map((item, index, all) => ({
    x: x(item.t),
    label: item.label,
    anchor: (all.length === 1 ? "middle" : index === 0 ? "start" : index === all.length - 1 ? "end" : "middle") as
      | "start"
      | "middle"
      | "end",
  }));
  return {
    plotRight,
    bottom,
    xy,
    line,
    area: xy.length > 1 ? areaPath(line, xy[0].x, xy[xy.length - 1].x, bottom) : "",
    yTicks: scale.ticks.map((value, index) => ({ y: y(value), label: labels[index] })),
    xTicks: xTicks.length === 1 ? [{ ...xTicks[0], x: plotRight / 2 }] : xTicks,
    dots: dotTimes
      .map((item) => {
        const cx = x(item.t);
        const cy = Math.min(Math.max(y(item.dot.value), TOP - 6), bottom);
        const on = item.dot.hollow || xy.length < 2 ? cy : resampleY(xy, cx, cx, 1)[0];
        return { x: cx, y: Math.abs(on - cy) <= SNAP_PX ? on : cy, dot: item.dot };
      })
      .sort((a, b) => a.x - b.x || a.y - b.y),
    ath: athIndex(series),
    base: xy.length > 1 ? { x: xy[0].x, y: xy[0].y } : null,
    ref: refLine ? { y: y(refLine.value), label: refLine.label } : null,
    band: band ? { y: y(band.high), h: Math.max(y(band.low) - y(band.high), 1) } : null,
  };
}

/** The one chart for every value line in the app. SVG, no chart library. */
export const ValueChart = memo(function ValueChart(props: Props) {
  const id = useId();
  if (props.variant === "spark") {
    return (
      <ValueSpark
        id={id}
        points={props.points}
        tone={props.tone}
        ariaLabel={props.ariaLabel}
        height={props.height}
        minSpan={props.minSpan}
        className={props.className}
      />
    );
  }
  return <FullChart {...props} />;
});

/** The draw-in: waits for the screen, plays once. */
type Draw = "wait" | "play" | "done";

function FullChart({
  points,
  ariaLabel,
  tone,
  height = 184,
  morphKey = "",
  onScrub,
  showAth = false,
  dots,
  selectedDotId = null,
  onSelectDot,
  refLine = null,
  band = null,
  minSpan,
  tooltip,
  layers,
  className = "",
}: Props) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [draw, setDraw] = useState<Draw>(() =>
    typeof IntersectionObserver === "undefined" || reducedMotion() ? "done" : "wait",
  );
  const activeRef = useRef<number | null>(null);
  const pressed = useRef(false);
  const frame = useRef(0);
  const lastTick = useRef(0);
  /** Handler calls made before the scrub chunk is in, replayed in order once it is. */
  const held = useRef<((module: ScrubModule) => void)[]>([]);
  const noDots = useMemo<ChartDot[]>(() => [], []);
  const dotList = dots ?? noDots;
  const withDots = dotList.length > 0;

  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((current) => (current === next ? current : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // One observer: draws in when first seen; pauses the pulse off screen or in a hidden tab.
  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let inView = false;
    const sync = () => {
      const on = inView && document.visibilityState !== "hidden";
      node.toggleAttribute("data-chart-paused", !on);
      if (on) setDraw((current) => (current === "wait" ? "play" : current));
    };
    sync();
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) inView = entry.isIntersecting && entry.intersectionRatio >= SEEN * 0.99;
        sync();
      },
      { threshold: [0, SEEN] },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const geom = useMemo(
    () => (width > 0 ? build(points, dotList, width, height, refLine, band, minSpan) : null),
    [points, dotList, width, height, refLine, band, minSpan],
  );
  // Range morph: animate between the old and new line, straight on the DOM, no re-render per frame.
  const shown = useRef<{ key: string; xy: XY[]; plotRight: number } | null>(null);
  useLayoutEffect(() => {
    if (!geom) return;
    const before = shown.current;
    shown.current = { key: morphKey, xy: geom.xy, plotRight: geom.plotRight };
    const lineNode = lineRef.current;
    const areaNode = areaRef.current;
    if (!before || before.key === morphKey || !lineNode || !areaNode || geom.xy.length < 2 || before.xy.length < 2) return;
    if (reducedMotion()) return;
    const x0 = 0;
    const x1 = geom.plotRight;
    const from = resampleY(before.xy, x0, x1, MORPH_SAMPLES);
    const to = resampleY(geom.xy, x0, x1, MORPH_SAMPLES);
    const xs = to.map((_, index) => x0 + ((x1 - x0) * index) / (MORPH_SAMPLES - 1));
    const paint = (progress: number) => {
      const eased = 1 - (1 - progress) ** 3;
      const pts = xs.map((x, index) => ({ x, y: from[index] + (to[index] - from[index]) * eased }));
      const d = linePath(pts);
      lineNode.setAttribute("d", d);
      areaNode.setAttribute("d", areaPath(d, x0, x1, geom.bottom));
    };
    paint(0);
    let start = 0;
    let raf = 0;
    const step = (time: number) => {
      start ||= time;
      const progress = Math.min(1, (time - start) / MORPH_MS);
      if (progress < 1) {
        paint(progress);
        raf = window.requestAnimationFrame(step);
      } else {
        lineNode.setAttribute("d", geom.line);
        areaNode.setAttribute("d", geom.area);
      }
    };
    raf = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(raf);
      lineNode.setAttribute("d", geom.line);
      areaNode.setAttribute("d", geom.area);
    };
  }, [geom, morphKey]);

  const xs = useMemo(
    () => (geom ? (withDots ? geom.dots.map((dot) => dot.x) : geom.xy.map((pt) => pt.x)) : []),
    [geom, withDots],
  );

  const select = useCallback(
    (index: number | null) => {
      if (activeRef.current === index) return;
      activeRef.current = index;
      setActive(index);
      if (withDots) {
        onSelectDot?.(index == null ? null : (geom?.dots[index]?.dot.id ?? null));
      } else {
        onScrub?.(index == null ? null : (geom?.xy[index]?.point ?? null));
      }
    },
    [geom, onScrub, onSelectDot, withDots],
  );

  // Selection from outside (a tapped row in Recent sales).
  const selectedIndex = withDots && geom ? geom.dots.findIndex((item) => item.dot.id === selectedDotId) : -1;
  const shownIndex = withDots ? (selectedIndex >= 0 ? selectedIndex : null) : active;

  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);
  // The scrub chunk writes the tooltip: redraw once it is in.
  const [, setScrubReady] = useState(Boolean(scrubModule));
  useEffect(() => afterFirstIdle(() => void loadScrub().then(() => setScrubReady(true), () => {})), []);

  // Read by the handlers when they run, which can be after a held tap's render.
  const scrubState = useRef<ScrubState | null>(null);
  useLayoutEffect(() => {
    scrubState.current = { xs, withDots, selectedIndex, pressed, frame, activeRef, lastTick, select };
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
      },
      () => {
        held.current = [];
      },
    );
  }

  function preloadScrub() {
    if (!scrubModule) void loadScrub().catch(() => {});
  }

  const reduce = reducedMotion();
  const last = geom?.xy[geom.xy.length - 1];
  const activePt =
    shownIndex == null || !geom
      ? null
      : withDots
        ? geom.dots[shownIndex]
        : geom.xy[shownIndex];
  const latestDot = geom
    ? geom.dots.reduce<(typeof geom.dots)[number] | null>(
        (best, item) => (!item.dot.hollow && (!best || item.x >= best.x) ? item : best),
        null,
      )
    : null;
  const ath =
    geom && showAth && geom.xy.length >= 3 && shownIndex == null && geom.ath >= 0 ? geom.xy[geom.ath] : null;
  const athIsLast = ath != null && ath === last;
  const drawing = draw !== "done" && !reduce;
  const fewDots = withDots && (geom?.xy.length ?? 0) < 2;

  const decor =
    geom && layers
      ? layers({
          width,
          plotRight: geom.plotRight,
          bottom: geom.bottom,
          ref: geom.ref,
          band: geom.band,
          marks: [...geom.dots.filter((item) => !item.dot.hollow), ...(last ? [last] : [])],
        })
      : null;

  const tip =
    activePt && geom && scrubModule
      ? scrubModule.chartTip({
          x: activePt.x,
          y: activePt.y,
          plotRight: geom.plotRight,
          ...("point" in activePt
            ? { value: activePt.point.value, date: activePt.point.date, marker: activePt.point.marker }
            : { value: activePt.dot.value, date: activePt.dot.date, marker: null }),
          dateOnly: !withDots && (tooltip ?? (onScrub ? "date" : "value")) === "date",
        })
      : null;

  return (
    <div ref={box} className={`chart-surface relative w-full select-none ${className}`} style={{ height }} data-no-pull="">
      {geom ? (
        <svg
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={`block cursor-crosshair overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${TONE_CLASS[tone]}`}
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
            const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
            const { pointerType } = event;
            scrub((module, state) => module.pressAt(state, x, pointerType));
          }}
          onPointerMove={(event) => {
            if (!pressed.current && !(event.pointerType === "mouse" && !withDots)) return;
            const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
            const { pointerType } = event;
            scrub((module, state) => module.scrubTo(state, x, pointerType));
          }}
          onPointerUp={() => scrub((module, state) => module.release(state))}
          onPointerCancel={() => scrub((module, state) => module.release(state))}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse" && !pressed.current) scrub((module, state) => module.release(state));
          }}
          onBlur={() => {
            if (!withDots) select(null);
          }}
          onKeyDown={(event) => {
            if (!xs.length) return;
            const { key } = event;
            if (key === "ArrowRight" || key === "ArrowLeft") event.preventDefault();
            if (key === "ArrowRight" || key === "ArrowLeft" || key === "Escape") {
              scrub((module, state) => module.keyDown(state, key));
            }
          }}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <FillStops />
            </linearGradient>
          </defs>

          <g key={`grid-${morphKey}`} className="chart-fade">
            {geom.yTicks.map((item) => (
              <g key={`${item.label}-${item.y}`}>
                <line x1={0} x2={geom.plotRight} y1={item.y} y2={item.y} className={CHART.grid} strokeWidth={1} />
                {decor?.clearY != null && Math.abs(item.y - decor.clearY) < PILL_CLEAR ? null : (
                  <text x={width} y={item.y} dy="0.32em" textAnchor="end" className={CHART.tick}>
                    {item.label}
                  </text>
                )}
              </g>
            ))}
            {geom.xTicks.map((item) => (
              <text key={`${item.label}-${item.x}`} x={item.x} y={height - 6} textAnchor={item.anchor} className={CHART.tick}>
                {item.label}
              </text>
            ))}
          </g>

          {decor?.back}
          {geom.base && !geom.ref ? (
            <line
              data-chart-baseline=""
              x1={geom.base.x}
              x2={geom.plotRight}
              y1={geom.base.y}
              y2={geom.base.y}
              className={CHART.baseline}
              strokeWidth={1}
              strokeDasharray={tone === "down" ? "2 3" : undefined}
            />
          ) : null}

          <path
            ref={areaRef}
            d={geom.area}
            fill={`url(#${id}-fill)`}
            className={drawing ? (draw === "play" ? "chart-draw-fill" : "chart-draw-fill-wait") : undefined}
          />
          <path
            ref={lineRef}
            data-chart-line=""
            d={geom.line}
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={drawing ? (draw === "play" ? "chart-draw" : "chart-draw-wait") : undefined}
          />

          <g className={fewDots && !reduce ? "chart-dots-in" : undefined}>
            {geom.dots.map((item, index) => {
              const on = index === shownIndex;
              const latest = !on && item === latestDot && shownIndex == null;
              return (
                <circle
                  key={item.dot.id}
                  cx={item.x}
                  cy={item.y}
                  r={on ? 6 : latest ? 4 : 3.5}
                  fill={item.dot.hollow ? "var(--chart-surface)" : "currentColor"}
                  fillOpacity={item.dot.hollow || on || latest ? 1 : 0.75}
                  stroke={item.dot.hollow ? "currentColor" : on ? undefined : "var(--chart-surface)"}
                  strokeWidth={item.dot.hollow ? 1.5 : on || latest ? 2 : 1}
                  className={on ? "chart-select" : undefined}
                />
              );
            })}
          </g>

          {decor?.front}

          <g
            key={`marks-${morphKey}`}
            className={draw === "wait" && drawing ? "opacity-0" : "chart-fade"}
            style={draw === "play" ? { animationDelay: "150ms" } : undefined}
          >
            {ath && !athIsLast ? (
              <circle cx={ath.x} cy={ath.y} r={3} fill="none" stroke="currentColor" strokeOpacity={0.6} strokeWidth={1.5} />
            ) : null}
            {ath ? (
              <text
                x={Math.min(Math.max(ath.x, 4), geom.plotRight - 4)}
                y={Math.max(ath.y - 9, 10)}
                textAnchor={ath.x < 36 ? "start" : ath.x > geom.plotRight - 36 ? "end" : "middle"}
                className="chart-halo chart-tick text-[10.5px] tabular-nums"
              >
                ATH {money(ath.point.value).replace(/\.00$/, "")}
              </text>
            ) : null}
            {withDots && latestDot && shownIndex == null && !reduce ? (
              <circle cx={latestDot.x} cy={latestDot.y} r={4} fill="currentColor" className="chart-pulse" />
            ) : null}
            {last && !withDots && shownIndex == null ? (
              <g>
                {reduce ? null : <circle cx={last.x} cy={last.y} r={4} fill="currentColor" className="chart-pulse" />}
                <circle cx={last.x} cy={last.y} r={4} fill="currentColor" stroke="var(--chart-surface)" strokeWidth={2} />
              </g>
            ) : null}
          </g>

          {activePt ? (
            <g pointerEvents="none">
              <line
                x1={activePt.x}
                x2={activePt.x}
                y1={TOP - 8}
                y2={geom.bottom}
                className="stroke-zinc-400 dark:stroke-zinc-500"
                strokeWidth={1}
              />
              {!withDots ? (
                <circle cx={activePt.x} cy={activePt.y} r={5} fill="currentColor" stroke="var(--chart-surface)" strokeWidth={2} />
              ) : null}
            </g>
          ) : null}
        </svg>
      ) : null}
      {tip ? (
        <div aria-hidden="true" data-chart-tip="" className={CHART.tip} style={{ width: tip.w, transform: `translate(${tip.left}px, ${tip.top}px)` }}>
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
