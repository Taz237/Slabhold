"use client";

import { useEffect, useState } from "react";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import {
  canShowCollectionTrend,
  collectionTrendView,
  TREND_RANGES,
  type TrendRange,
  type TrendSnapshot,
} from "@/lib/collection/value-trend";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

function Sparkline({ points }: { points: TrendSnapshot[] }) {
  const width = 120;
  const height = 32;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 2) + 1;
    const y = span === 0 ? height / 2 : height - 2 - ((value - min) / span) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-1 h-8 w-full max-w-[7.5rem]"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}

export function CollectionTrendReadout({
  viewerId,
  ownerId,
  collectionPublic,
  snapshots,
  range,
  today,
  onRange,
}: {
  viewerId: string | null;
  ownerId: string | null;
  collectionPublic: boolean;
  snapshots: TrendSnapshot[];
  range: TrendRange;
  today: string;
  onRange: (range: TrendRange) => void;
}) {
  const view = collectionTrendView({
    viewerId,
    ownerId,
    collectionPublic,
    snapshots,
    range,
    today,
  });
  if (!view) return null;
  if (view.kind === "tracking") {
    if (!view.label) return null;
    return <p className="mt-1 text-xs font-medium text-zinc-500">{view.label}</p>;
  }

  const tone =
    view.delta == null || view.delta === 0
      ? "text-zinc-500"
      : view.delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="mt-1">
      {view.label ? <p className={`text-xs font-medium ${tone}`}>{view.label}</p> : null}
      {view.points.length >= 2 ? (
        <div className={tone}>
          <Sparkline points={view.points} />
        </div>
      ) : null}
      <div className="mt-1.5 flex gap-1" role="group" aria-label="Collection value range">
        {TREND_RANGES.map((item) => {
          const selected = item.id === range;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onRange(item.id)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                selected
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-500 dark:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CollectionValueTrend({
  viewerId,
  ownerId,
  collectionPublic,
}: {
  viewerId: string | null;
  ownerId: string | null;
  collectionPublic: boolean;
}) {
  const [snapshots, setSnapshots] = useState<TrendSnapshot[] | null>(null);
  const [range, setRange] = useState<TrendRange>("7d");
  const allowed = canShowCollectionTrend({ viewerId, ownerId, collectionPublic });

  useEffect(() => {
    if (!allowed) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("collection_snapshots")
      .select("snapshot_date, value")
      .order("snapshot_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSnapshots([]);
          return;
        }
        setSnapshots(
          (data ?? []).map((row) => ({
            date: String(row.snapshot_date).slice(0, 10),
            value: Number(row.value) || 0,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed || snapshots == null) return null;
  return (
    <CollectionTrendReadout
      viewerId={viewerId}
      ownerId={ownerId}
      collectionPublic={collectionPublic}
      snapshots={snapshots}
      range={range}
      today={snapshotDateInNewYork()}
      onRange={setRange}
    />
  );
}
