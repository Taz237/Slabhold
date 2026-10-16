"use client";

import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/format";
import { mockValueHistory, type ValuePoint } from "@/lib/value-history";

export function ValueChart({
  card,
  points: pointsProp,
  source = "sample",
  loading = false,
  median = null,
  p25 = null,
  p75 = null,
  count = 0,
  sample = true,
  unavailable = false,
  noSalesLabel,
}: {
  card: { id: string; estimatedSellPrice: number; purchasePrice: number };
  points?: ValuePoint[] | null;
  source?: "trawl" | "sample" | "off";
  loading?: boolean;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  count?: number;
  sample?: boolean;
  unavailable?: boolean;
  noSalesLabel?: string;
  /** Kept for callers; empty comps always show "No sales yet". */
  hideStatusLabel?: boolean;
}) {
  if (unavailable && !loading) {
    return null;
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
        <p className="text-[11px] tracking-wide text-zinc-500 uppercase">
          Sold comps
        </p>
        <p className="mt-2 text-sm text-zinc-500">Loading sold prices…</p>
        <div className="mt-3 h-44 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
      </section>
    );
  }

  const usingLive = source === "trawl" && !sample;
  const showSample = sample || source === "sample" || source === "off";
  const points =
    usingLive && pointsProp && pointsProp.length > 0
      ? pointsProp
      : showSample
        ? mockValueHistory(card)
        : [];

  const displayMedian =
    usingLive && median != null
      ? median
      : (points[points.length - 1]?.value ?? card.estimatedSellPrice);
  const displayP25 = usingLive ? p25 : null;
  const displayP75 = usingLive ? p75 : null;
  const n = usingLive ? count : points.length;
  const lowConfidence = usingLive && n > 0 && n < 5;
  const noSales = usingLive && n === 0;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">
            {usingLive ? "Sold comps" : "Estimated value"}
          </p>
          {noSales ? (
            <p className="mt-1 text-lg font-semibold tracking-tight">
              {noSalesLabel ?? "No sales yet"}
            </p>
          ) : (
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {money(displayMedian)}
            </p>
          )}
          {usingLive && !noSales && displayP25 != null && displayP75 != null ? (
            <p className="mt-1 text-sm text-zinc-500 tabular-nums">
              Middle 50%: {money(displayP25)} – {money(displayP75)}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          {usingLive && !noSales ? (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Based on {n} sale{n === 1 ? "" : "s"}
            </p>
          ) : null}
          {lowConfidence && !noSales ? (
            <span className="mt-1 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              Low confidence
            </span>
          ) : null}
        </div>
      </div>

      {!usingLive ? (
        <p className="mt-2 text-xs text-zinc-500">Sample history from recent months</p>
      ) : null}

      {!noSales && points.length > 0 ? (
        <div className="mt-3 h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`value-fill-${card.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip content={<ValueTip />} cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }} />
              {usingLive && displayP25 != null && displayP75 != null ? (
                <ReferenceArea y1={displayP25} y2={displayP75} fill="#10b981" fillOpacity={0.12} />
              ) : null}
              {usingLive && displayMedian != null ? (
                <ReferenceLine
                  y={displayMedian}
                  stroke="#059669"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2.5}
                fill={`url(#value-fill-${card.id})`}
                dot={usingLive}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#10b981" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}

function ValueTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ValuePoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <p className="text-zinc-500">{point.label}</p>
      <p className="font-semibold tabular-nums">{money(point.value)}</p>
    </div>
  );
}
