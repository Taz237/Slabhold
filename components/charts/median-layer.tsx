import type { ReactNode } from "react";
import { CHART } from "@/lib/chart/theme";

/**
 * The comp chart's own layers: the middle half of sales as a purple band, the
 * median line and its "Median $212.49" pill, and the sales as dots. Only the
 * comp chart (SalesChart, lazy) draws them, so this stays out of the pages
 * that only draw a value line.
 */

type Dot = { x: number; y: number; dot: { id: string; hollow?: boolean } };

export type LayerGeom = {
  width: number;
  plotRight: number;
  bottom: number;
  ref: { y: number; label: string } | null;
  band: { y: number; h: number } | null;
  /** The line's end. */
  last?: { x: number; y: number } | null;
  /** Sales, left to right. */
  dots: Dot[];
  /** The picked sale's index. */
  shown: number | null;
  /** The newest sale on the trend: it gets the latest-value dot and the pulse. */
  latest: Dot | null;
  motion: boolean;
};

export type ChartLayers = {
  /** Under the line: the band and the median line. */
  back: ReactNode;
  /** Over the line: the sales. */
  mid: ReactNode;
  /** Over the dots: the pill. */
  front: ReactNode;
  /** A y label this close to it hides (the pill sits over the label gutter). */
  clearY: number | null;
};

const PILL_H = 18;

/** Rough text width for Geist at 10.5px, so the pill fits without measuring. */
function pillWidth(text: string): number {
  return Math.ceil(text.length * 6.3 + 14);
}

function saleDots(g: LayerGeom): ReactNode {
  const idle = g.shown == null;
  return (
    // A few sales fade in once.
    <g className={g.motion && g.dots.length < 3 ? "chart-dots-in" : undefined}>
      {g.dots.map((item, index) => {
        const on = index === g.shown;
        const latest = idle && item === g.latest;
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
      {idle && g.latest && g.motion ? <circle cx={g.latest.x} cy={g.latest.y} r={4} fill="currentColor" className="chart-pulse" /> : null}
    </g>
  );
}

export function medianLayers(g: LayerGeom): ChartLayers {
  const mid = saleDots(g);
  const marks = [...g.dots.filter((item) => !item.dot.hollow), ...(g.last ? [g.last] : [])];
  const back = (
    <>
      {g.band ? (
        <rect data-chart-band="" x={0} width={g.plotRight} y={g.band.y} height={g.band.h} className={CHART.band} />
      ) : null}
      {g.ref ? (
        <line data-chart-median="" x1={0} x2={g.plotRight} y1={g.ref.y} y2={g.ref.y} className={CHART.median} strokeWidth={1} />
      ) : null}
    </>
  );
  if (!g.ref) return { back, mid, front: null, clearY: null };
  const w = pillWidth(g.ref.label);
  const cy = Math.min(Math.max(g.ref.y, PILL_H / 2 + 1), g.bottom - PILL_H / 2);
  // At the right edge, over the label gutter; at the left when a sale would hide under it there.
  const covers = (x0: number) =>
    marks.some((pt) => pt.x >= x0 - 4 && pt.x <= x0 + w + 4 && Math.abs(pt.y - cy) <= PILL_H / 2 + 4);
  const right = g.width - w;
  const x = covers(right) && !covers(0) ? 0 : right;
  return {
    back,
    mid,
    front: (
      <g data-chart-pill="" className={CHART.pill} pointerEvents="none">
        <rect x={x + 0.5} y={cy - PILL_H / 2} width={w - 1} height={PILL_H} rx={PILL_H / 2} strokeWidth={1} />
        <text x={x + w / 2} y={cy} dy="0.34em" textAnchor="middle" className="text-[10.5px] font-medium tabular-nums">
          {g.ref.label}
        </text>
      </g>
    ),
    clearY: x === right ? cy : null,
  };
}
