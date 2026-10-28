"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Info, TrendingDown, TrendingUp } from "lucide-react";
import { AddCardLink } from "@/components/add-card-link";
import {
  CollectionValueHistory,
  useCollectionSnapshots,
} from "@/components/collection-value-history";
import { readHeroOpen, sparklinePath, writeHeroOpen } from "@/lib/collection/grid";
import {
  investedAmountLabel,
  investedCardLabel,
  profitAmountLabel,
  profitAmountTone,
  profitCardLabel,
} from "@/lib/collection/profit-label";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { money, pct, signedMoney } from "@/lib/format";

export type PortfolioHeroProps = {
  cardCount: number;
  collectionValue: number;
  profitTotal: number;
  pricedCount: number;
  pricedInvested: number;
  investedAmount: number;
  paidCount: number;
  withoutValueCount: number;
  valuesLoading: boolean;
  valuesFailed: boolean;
  valuesMessage: string | null;
  onRetry: () => void;
};

const SPARK_W = 96;
const SPARK_H = 28;
const SPARK_DAYS = 30;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Collection value up top. Tap to open the chart and the full numbers. */
export function PortfolioHero(props: PortfolioHeroProps) {
  const {
    cardCount,
    collectionValue,
    profitTotal,
    pricedCount,
    pricedInvested,
    investedAmount,
    paidCount,
    withoutValueCount,
    valuesLoading,
    valuesFailed,
    valuesMessage,
    onRetry,
  } = props;
  // Dashboard mounts the hero only after the collection loads in the browser,
  // so reading storage here can't mismatch the server render.
  const [open, setOpen] = useState(() => readHeroOpen(storage()));
  const [everOpened, setEverOpened] = useState(open);
  const panelId = useId();
  const snapshots = useCollectionSnapshots();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) setEverOpened(true);
    writeHeroOpen(storage(), next);
  }

  const liveReady = !valuesLoading && !valuesFailed;
  const spark = useMemo(() => {
    const byDate = new Map(snapshots.rows.map((row) => [row.snapshot_date, row.value]));
    if (liveReady) byDate.set(snapshotDateInNewYork(), collectionValue);
    const series = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-SPARK_DAYS)
      .map(([, value]) => value);
    const path = sparklinePath(series, SPARK_W, SPARK_H);
    const rising = series.length >= 2 ? series[series.length - 1] >= series[0] : true;
    return { path, rising };
  }, [snapshots.rows, liveReady, collectionValue]);

  const showGain = liveReady && pricedCount > 0;
  const gainUp = profitTotal >= 0;
  const gainPct = pricedInvested > 0 ? pct(profitTotal / pricedInvested) : null;
  const countText = `${cardCount} card${cardCount === 1 ? "" : "s"}`;
  const withoutValueText =
    withoutValueCount > 0
      ? `${withoutValueCount} card${withoutValueCount === 1 ? "" : "s"} without a value yet`
      : "Held book value";

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#18181B]"
      aria-label="Collection value"
    >
      <span
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#7C3AED]/20 blur-3xl dark:bg-[#7C3AED]/25"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3 p-4 sm:p-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="group -m-2 min-h-11 min-w-0 flex-1 rounded-2xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        >
          <span className="flex items-center gap-1 font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            Collection value
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </span>
          {valuesLoading ? (
            <>
              <span className="mt-2 block h-10 w-44 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-white/10" aria-hidden />
              <span className="mt-2 block h-5 w-28 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" aria-hidden />
              <span className="sr-only">Loading collection value</span>
            </>
          ) : (
            <span className="mt-1 block text-[40px] leading-[1.1] font-extrabold tracking-[-0.03em] tabular-nums">
              {valuesFailed ? "—" : money(collectionValue)}
            </span>
          )}
          <span className="mt-2 flex flex-wrap items-center gap-2">
            {showGain ? (
              <span
                data-gain={gainUp ? "up" : "down"}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  gainUp
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                }`}
              >
                {gainUp ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                )}
                {signedMoney(profitTotal)}
                {gainPct ? <span className="opacity-80">{gainPct}</span> : null}
              </span>
            ) : null}
            <span className="text-xs font-medium text-zinc-500">{countText}</span>
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <AddCardLink />
          {spark.path ? (
            <svg
              width={SPARK_W}
              height={SPARK_H}
              viewBox={`-2 -2 ${SPARK_W + 4} ${SPARK_H + 4}`}
              className={spark.rising ? "text-emerald-500" : "text-rose-500"}
              aria-hidden
            >
              <path
                d={spark.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
      </div>
      {valuesFailed ? (
        <div className="relative px-4 pb-4 text-sm font-medium sm:px-5">
          <ValuesRetry onRetry={onRetry} detail={valuesMessage} />
        </div>
      ) : null}
      <div
        id={panelId}
        inert={!open}
        className={`relative grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {everOpened ? (
            <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
              <CollectionValueHistory
                currentValue={collectionValue}
                valueLoading={valuesLoading}
                valueError={valuesFailed}
                onRetry={onRetry}
                snapshots={snapshots}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Stat
                  label="Total invested"
                  value={investedAmountLabel(investedAmount)}
                  hint={investedCardLabel(paidCount, cardCount)}
                  tone={paidCount > 0 ? undefined : "neutral"}
                />
                <Stat
                  label="Estimated value"
                  value={valuesFailed ? "" : money(collectionValue)}
                  hint={valuesFailed ? "" : withoutValueText}
                  message={
                    valuesFailed ? (
                      <ValuesRetry onRetry={onRetry} detail={valuesMessage} />
                    ) : undefined
                  }
                  loading={valuesLoading}
                />
                <Stat
                  label="Profit"
                  value={valuesFailed ? "" : profitAmountLabel(pricedCount, profitTotal)}
                  hint={
                    valuesFailed || profitCardLabel(pricedCount, cardCount) === "—"
                      ? ""
                      : profitCardLabel(pricedCount, cardCount)
                  }
                  tone={profitAmountTone(pricedCount, profitTotal)}
                  message={
                    valuesFailed ? (
                      <ValuesRetry onRetry={onRetry} detail={valuesMessage} />
                    ) : undefined
                  }
                  loading={valuesLoading}
                />
              </div>
              <p className="flex items-start gap-1.5 text-xs text-zinc-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Profit only includes cards with a price paid and a current value.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ValuesRetry({
  onRetry,
  detail,
}: {
  onRetry: () => void;
  detail?: string | null;
}) {
  return (
    <p>
      {detail ?? "Couldn't load values."}{" "}
      <button type="button" onClick={onRetry} className="hit-44 font-semibold underline">
        Retry
      </button>
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  loading,
  message,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "up" | "down" | "neutral";
  loading?: boolean;
  message?: ReactNode;
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "neutral"
          ? "text-zinc-500"
          : "";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">{label}</p>
      {loading ? (
        <>
          <div className="mt-2 h-6 w-24 animate-pulse rounded-md bg-zinc-200/80 dark:bg-white/10" aria-hidden />
          <div className="mt-2 h-3 w-32 max-w-full animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" aria-hidden />
          <span className="sr-only">Loading {label}</span>
        </>
      ) : message ? (
        <div className="mt-1 text-sm leading-snug font-medium text-zinc-800 dark:text-zinc-100">
          {message}
        </div>
      ) : (
        <>
          <p className={`mt-1 text-xl font-bold tracking-tight tabular-nums ${toneClass}`}>{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
        </>
      )}
    </div>
  );
}
