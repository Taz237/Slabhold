"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, signedMoney } from "@/lib/format";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import type { ValuePoint } from "@/lib/value-history";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type RangeId = "7d" | "30d" | "all";

const RANGES: { id: RangeId; label: string; days: number | null; phrase: string }[] = [
  { id: "7d", label: "7D", days: 7, phrase: "this week" },
  { id: "30d", label: "30D", days: 30, phrase: "this month" },
  { id: "all", label: "All", days: null, phrase: "all time" },
];

type SnapshotRow = {
  snapshot_date: string;
  value: number;
};

function formatLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function CollectionValueHistory({
  currentValue,
}: {
  /** Live estimated value from Collection summary — fills today if cron hasn't written yet. */
  currentValue: number;
}) {
  const [range, setRange] = useState<RangeId>("30d");
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setLoading(false);
      return;
    }

    void supabase
      .from("collection_snapshots")
      .select("snapshot_date, value")
      .order("snapshot_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setRows([]);
        } else {
          setRows(
            (data ?? []).map((row) => ({
              snapshot_date: String(row.snapshot_date),
              value: Number(row.value) || 0,
            })),
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const points = useMemo(() => {
    const today = snapshotDateInNewYork();
    const byDate = new Map(rows.map((row) => [row.snapshot_date, row.value]));
    if (!byDate.has(today)) {
      byDate.set(today, currentValue);
    }

    let series = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]): ValuePoint => ({
        date,
        label: formatLabel(date),
        value,
      }));

    const selected = RANGES.find((item) => item.id === range);
    if (selected?.days != null) {
      const start = addDaysToYmd(today, -(selected.days - 1));
      series = series.filter((point) => point.date >= start);
    }
    return series;
  }, [currentValue, range, rows]);

  const selected = RANGES.find((item) => item.id === range)!;
  const canChart = points.length >= 2;
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const delta = last - first;
  const pct =
    first === 0 ? null : Math.round((delta / Math.abs(first)) * 100);
  const up = delta >= 0;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">
            Collection value
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {money(last)}
          </p>
          {canChart ? (
            <p
              className={`mt-1 text-sm font-medium ${
                up
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {signedMoney(delta)}
              {pct != null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""} {selected.phrase}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/10">
          {RANGES.map((item) => {
            const active = range === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  active
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                    : "text-zinc-500"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 h-44 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
      ) : !canChart ? (
        <p className="mt-4 text-sm text-zinc-500">
          Your value history starts today. Check back tomorrow.
        </p>
      ) : (
        <div className="mt-3 h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="collection-value-fill" x1="0" y1="0" x2="0" y2="1">
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
              <Tooltip content={<HistoryTip />} cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#collection-value-fill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#10b981" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function HistoryTip({
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
