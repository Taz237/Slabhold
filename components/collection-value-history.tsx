"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, signedMoney } from "@/lib/format";
import {
  HISTORY_RANGE_DISABLED,
  HISTORY_RANGES,
  distinctHistoryDays,
  formatAxisTick,
  formatTrackingSince,
  historyBadge,
  isHistoryRangeEnabled,
  pointsInHistoryRange,
  valueAxisDomain,
  valueAxisTicks,
  type HistoryRangeId,
} from "@/lib/collection/chart-range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import type { ValuePoint } from "@/lib/value-history";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

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

function readIndex(state: {
  activeTooltipIndex?: number | string | null;
} | null): number | null {
  const raw = state?.activeTooltipIndex;
  if (typeof raw === "number" && raw >= 0) return raw;
  if (typeof raw === "string" && raw !== "" && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

export function CollectionValueHistory({
  currentValue,
}: {
  /** Live estimated value from Collection summary — fills today if cron hasn't written yet. */
  currentValue: number;
}) {
  const [range, setRange] = useState<HistoryRangeId>("7d");
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const pinned = useRef(false);
  const touchedAt = useRef(0);

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

  const today = snapshotDateInNewYork();

  const allPoints = useMemo(() => {
    const byDate = new Map(rows.map((row) => [row.snapshot_date, row.value]));
    if (!byDate.has(today)) {
      byDate.set(today, currentValue);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]): ValuePoint => ({
        date,
        label: formatLabel(date),
        value,
      }));
  }, [currentValue, rows, today]);

  const historyDays = distinctHistoryDays(allPoints.map((point) => point.date));
  const selected: HistoryRangeId = isHistoryRangeEnabled(range, historyDays)
    ? range
    : "7d";
  const points = useMemo(
    () => pointsInHistoryRange(allPoints, selected, today),
    [allPoints, selected, today],
  );
  const canChart = allPoints.length >= 2;
  const tracking =
    canChart && historyDays < 7
      ? formatTrackingSince(allPoints[0]?.date ?? "")
      : null;
  const badge =
    canChart && !tracking ? historyBadge(allPoints, selected, today) : null;
  const phrase = HISTORY_RANGES.find((item) => item.id === selected)?.phrase ?? "";
  const last = points[points.length - 1]?.value ?? allPoints[allPoints.length - 1]?.value ?? 0;
  const domain = valueAxisDomain(points.map((point) => point.value));
  const yTicks = valueAxisTicks(domain);
  const ySpan = domain[1] - domain[0];
  const tip = activeIndex != null ? points[activeIndex] : null;

  function showIndex(
    state: { activeTooltipIndex?: number | string | null } | null,
    pin: boolean,
  ) {
    const index = readIndex(state);
    if (index == null || index >= points.length) return;
    if (pin) pinned.current = true;
    setActiveIndex(index);
  }

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
          {tracking ? (
            <p className="mt-1 text-sm font-medium text-zinc-500">{tracking}</p>
          ) : badge ? (
            <p
              className={`mt-1 text-sm font-medium ${
                badge.delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : badge.delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-zinc-500"
              }`}
            >
              {signedMoney(badge.delta)}
              {badge.pct != null ? ` (${badge.pct > 0 ? "+" : ""}${badge.pct}%)` : ""}{" "}
              {phrase}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/10">
          {HISTORY_RANGES.map((item) => {
            const enabled = isHistoryRangeEnabled(item.id, historyDays);
            const active = selected === item.id && enabled;
            return (
              <span
                key={item.id}
                title={enabled ? undefined : HISTORY_RANGE_DISABLED}
                className="inline-flex"
              >
                <button
                  type="button"
                  disabled={!enabled}
                  aria-disabled={!enabled}
                  onClick={() => {
                    if (!enabled) return;
                    setActiveIndex(null);
                    pinned.current = false;
                    setRange(item.id);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    active
                      ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                      : enabled
                        ? "text-zinc-500"
                        : "cursor-not-allowed text-zinc-400"
                  }`}
                >
                  {item.label}
                </button>
              </span>
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
        <div className="relative mt-3 h-44 w-full">
          {tip ? (
            <div className="pointer-events-none absolute top-0 right-0 z-10">
              <HistoryTip point={tip} />
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              onMouseMove={(state) => {
                if (Date.now() - touchedAt.current < 700) return;
                pinned.current = false;
                showIndex(state, false);
              }}
              onMouseLeave={() => {
                if (pinned.current) return;
                setActiveIndex(null);
              }}
              onClick={(state) => showIndex(state, true)}
              onTouchStart={(state) => {
                touchedAt.current = Date.now();
                showIndex(state, true);
              }}
            >
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                width={56}
                domain={domain}
                ticks={yTicks}
                interval={0}
                tickFormatter={(value) => formatAxisTick(Number(value), ySpan)}
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={() => null}
                cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
              />
              <defs>
                <linearGradient id="collection-value-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
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

function HistoryTip({ point }: { point: ValuePoint }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <p className="text-zinc-500">{point.label}</p>
      <p className="font-semibold tabular-nums">{money(point.value)}</p>
    </div>
  );
}
