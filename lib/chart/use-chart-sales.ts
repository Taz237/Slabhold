"use client";

import { useState } from "react";
import { salesFromComps, type ChartSale } from "./sales";

type Comp = Parameters<typeof salesFromComps>[0][number];

/**
 * Chart sales that keep one identity while the comps say the same thing, so a
 * re-render of the card page does not redraw the chart.
 */
export function useChartSales(comps: readonly Comp[] | null): ChartSale[] | null {
  const key = comps
    ? comps.map((comp) => `${comp.id}|${comp.soldPrice}|${comp.soldDate}|${comp.condition ?? ""}`).join("\n")
    : null;
  const [held, setHeld] = useState<{ key: string | null; sales: ChartSale[] | null }>({ key: null, sales: null });
  if (held.key !== key) {
    const next = { key, sales: comps ? salesFromComps(comps) : null };
    setHeld(next);
    return next.sales;
  }
  return held.sales;
}
