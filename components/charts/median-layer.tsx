import type { ReactNode } from "react";
import { CHART } from "@/lib/chart/theme";

/**
 * The comp chart's median: the middle half of sales as a purple band, the
 * median as a solid line inside it, and its "Median $212.49" pill. Only the
 * comp chart (SalesChart, lazy) draws one, so this stays out of the pages
 * that only draw a value line.
 */

export type LayerGeom = {
  width: number;
  plotRight: number;
  bottom: number;
  ref: { y: number; label: string } | null;
  band: { y: number; h: number } | null;
  /** Sales and the line's end, which the pill must not cover. */
  marks: { x: number; y: number }[];
};

export type ChartLayers = {
  /** Under the line: the band and the median line. */
  back: ReactNode;
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

export function medianLayers(g: LayerGeom): ChartLayers {
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
  if (!g.ref) return { back, front: null, clearY: null };
  const w = pillWidth(g.ref.label);
  const cy = Math.min(Math.max(g.ref.y, PILL_H / 2 + 1), g.bottom - PILL_H / 2);
  // At the right edge, over the label gutter; at the left when a sale would hide under it there.
  const covers = (x0: number) =>
    g.marks.some((pt) => pt.x >= x0 - 4 && pt.x <= x0 + w + 4 && Math.abs(pt.y - cy) <= PILL_H / 2 + 4);
  const right = g.width - w;
  const x = covers(right) && !covers(0) ? 0 : right;
  return {
    back,
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
