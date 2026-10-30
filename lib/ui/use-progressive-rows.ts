"use client";

import { startTransition, useEffect, useState } from "react";
import { afterFirstIdle } from "@/lib/ui/idle";

/**
 * How many rows of a long list to draw. A server-drawn first screen
 * (`enabled`) starts with `step` rows, then adds `step` more per idle moment
 * until all are in, so neither hydration nor any one commit lays out the
 * whole list. `hold` keeps it at `step` until the page is ready to grow.
 * Lists that weren't server-drawn get every row at once, as before.
 */
export function useProgressiveRows(total: number, options: { enabled: boolean; step: number; hold?: boolean }): number {
  const { enabled, step, hold = false } = options;
  const [limit, setLimit] = useState(enabled ? step : Number.POSITIVE_INFINITY);
  const growing = !hold && limit < total;
  useEffect(() => {
    if (!growing) return;
    return afterFirstIdle(() => startTransition(() => setLimit((current) => current + step)));
  }, [growing, limit, step]);
  return hold ? Math.min(limit, step) : limit;
}
