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
  smoothStepPath,
  type XY,
} from "@/lib/chart/path";
import { axisLabels, valueScale } from "@/lib/chart/scale";
import { TONE_CLASS, ValueSpark, type ChartTone } from "@/components/charts/value-spark";
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
  /** "step" for values that jump on a day (a card added). */
  curve?: "monotone" | "step";
  /** Changes when the range changes, so the line morphs instead of jumping. */
  morphKey?: string;
  /** Scrubbed point, or null on release. */
  onScrub?: (point: ChartPoint | null) => void;
  /** "ATH $285" over the highest point. */
  showAth?: boolean;
  /** Sales as dots. With dots, a scrub or tap picks a dot instead of a line point. */
  dots?: ChartDot[];
  selectedDotId?: string | null;
  onSelectDot?: (id: string | null) => void;
  /** Labeled dashed line, like "Median $34.99". */
  refLine?: { value: number; label: string } | null;
  /** Faint band behind the line, like the middle 50% of sales. */
  band?: { low: number; high: number } | null;
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
  ref: { y: number; label: string } | null;
  band: { y: number; h: number } | null;
};

function build(
  points: ChartPoint[],
  dots: ChartDot[],
  width: number,
  height: number,
  curve: "monotone" | "step",
  refLine: Props["refLine"],
  band: Props["band"],
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
  const scale = valueScale(values);
  const times = [...series.map((point) => point.t), ...dotTimes.map((item) => item.t)];
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const plotRight = Math.max(width - GUTTER, 40);
  const bottom = height - BOTTOM;
  const edge = dots.length ? 6 : 0;
  const x = xScale(t0, t1, edge, plotRight - edge);
  const y = yScale(scale.domain, TOP, bottom);
  const xy = series.map((point) => ({ x: x(point.t), y: y(point.value), point }));
  const line = xy.length > 1 ? (curve === "step" ? smoothStepPath(xy) : monotonePath(xy)) : "";
  const labels = axisLabels(scale.ticks);
  const xTicks = dateTicks(t0, t1, 4).map((item, index, all) => ({
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
      .map((item) => ({ x: x(item.t), y: Math.min(Math.max(y(item.dot.value), TOP - 6), bottom), dot: item.dot }))
      .sort((a, b) => a.x - b.x || a.y - b.y),
    ath: athIndex(series),
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
        className={props.className}
      />
    );
  }
  return <FullChart {...props} />;
});

function FullChart({
  points,
  ariaLabel,
  tone,
  height = 184,
  curve = "monotone",
  morphKey = "",
  onScrub,
  showAth = false,
  dots,
  selectedDotId = null,
  onSelectDot,
  refLine = null,
  band = null,
  className = "",
}: Props) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
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

  const geom = useMemo(
    () => (width > 0 ? build(points, dotList, width, height, curve, refLine, band) : null),
    [points, dotList, width, height, curve, refLine, band],
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
  useEffect(() => afterFirstIdle(() => void loadScrub().catch(() => {})), []);

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
  const marker = !withDots && activePt && "point" in activePt ? activePt.point.marker : null;
  const ath = geom && showAth && geom.xy.length >= 3 && shownIndex == null ? geom.xy[geom.ath] : null;

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
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>

          <g key={`grid-${morphKey}`} className="chart-fade">
            {geom.yTicks.map((item) => (
              <g key={`${item.label}-${item.y}`}>
                <line
                  x1={0}
                  x2={geom.plotRight}
                  y1={item.y}
                  y2={item.y}
                  className="stroke-zinc-200 dark:stroke-white/[0.07]"
                  strokeWidth={1}
                />
                <text
                  x={width}
                  y={item.y}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-zinc-500 text-[10.5px] tabular-nums dark:fill-zinc-400"
                >
                  {item.label}
                </text>
              </g>
            ))}
            {geom.xTicks.map((item) => (
              <text
                key={`${item.label}-${item.x}`}
                x={item.x}
                y={height - 6}
                textAnchor={item.anchor}
                className="fill-zinc-500 text-[10.5px] tabular-nums dark:fill-zinc-400"
              >
                {item.label}
              </text>
            ))}
          </g>

          {geom.band ? (
            <rect x={0} width={geom.plotRight} y={geom.band.y} height={geom.band.h} fill="currentColor" opacity={0.08} />
          ) : null}
          {geom.ref ? (
            <g>
              <line
                x1={0}
                x2={geom.plotRight}
                y1={geom.ref.y}
                y2={geom.ref.y}
                className="stroke-zinc-400 dark:stroke-zinc-500"
                strokeDasharray="3 4"
                strokeWidth={1}
              />
              <text
                x={4}
                y={geom.ref.y - 5}
                className="chart-halo fill-zinc-600 text-[10.5px] font-semibold tabular-nums dark:fill-zinc-300"
              >
                {geom.ref.label}
              </text>
            </g>
          ) : null}

          <path ref={areaRef} d={geom.area} fill={`url(#${id}-fill)`} />
          <path
            ref={lineRef}
            d={geom.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {geom.dots.map((item, index) => (
            <circle
              key={item.dot.id}
              cx={item.x}
              cy={item.y}
              r={index === shownIndex ? 5 : 3}
              fill={item.dot.hollow ? "var(--chart-surface)" : "currentColor"}
              fillOpacity={item.dot.hollow ? 1 : index === shownIndex ? 1 : 0.55}
              stroke={item.dot.hollow || index === shownIndex ? "currentColor" : "none"}
              strokeWidth={item.dot.hollow ? 1.5 : 0}
              className={index === shownIndex ? "drop-shadow-sm" : undefined}
            />
          ))}

          <g key={`marks-${morphKey}`} className="chart-fade">
            {ath ? (
              <text
                x={Math.min(Math.max(ath.x, 4), geom.plotRight - 4)}
                y={Math.max(ath.y - 9, 10)}
                textAnchor={ath.x < 36 ? "start" : ath.x > geom.plotRight - 36 ? "end" : "middle"}
                className="chart-halo fill-zinc-600 text-[10.5px] font-semibold tabular-nums dark:fill-zinc-300"
              >
                ATH {money(ath.point.value).replace(/\.00$/, "")}
              </text>
            ) : null}
            {last && !withDots && shownIndex == null ? (
              <g>
                {reduce ? null : <circle cx={last.x} cy={last.y} r={3.5} fill="currentColor" className="chart-pulse" />}
                <circle cx={last.x} cy={last.y} r={3.5} fill="currentColor" stroke="var(--chart-surface)" strokeWidth={2} />
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
                <circle cx={activePt.x} cy={activePt.y} r={4.5} fill="currentColor" stroke="var(--chart-surface)" strokeWidth={2} />
              ) : null}
              {marker ? (
                <text
                  x={Math.min(Math.max(activePt.x, 4), geom.plotRight - 4)}
                  y={TOP - 11}
                  textAnchor={activePt.x < 60 ? "start" : activePt.x > geom.plotRight - 60 ? "end" : "middle"}
                  className="chart-halo fill-violet-700 text-[10.5px] font-semibold dark:fill-violet-300"
                >
                  {marker}
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
