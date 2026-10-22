"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardThumb } from "@/components/card-thumb";
import { ShareIconButton } from "@/components/share-button";
import {
  MOVING_TODAY_PATH,
  MOVING_TODAY_TITLE,
  shouldShowMovingToday,
  type MovingTodayPayload,
  type MovingTodaySale,
} from "@/lib/moving-today/types";

export const MOVING_TODAY_SLOT_CLASS = "min-h-[148px]";

type PanelStatus = "loading" | "ready";

function percentClass(percent: number | null): string {
  if (percent == null || percent === 0) return "text-zinc-500";
  if (percent > 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-rose-600 dark:text-rose-400";
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      {["one", "two", "three"].map((key) => (
        <div key={key} className="flex items-center gap-2 py-1.5">
          <div className="h-10 w-8 animate-pulse rounded-md bg-zinc-200/80 dark:bg-white/10" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-2.5 w-24 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export function MovingTodayPanel({
  status,
  dateLabel,
  sales,
}: {
  status: PanelStatus;
  dateLabel: string;
  sales: MovingTodaySale[];
}) {
  if (status === "ready" && !shouldShowMovingToday(sales)) return null;

  return (
    <section
      aria-label={MOVING_TODAY_TITLE}
      aria-busy={status === "loading"}
      data-moving-today=""
      className="border-b border-zinc-200 px-4 py-3 dark:border-white/10"
    >
      <div className={MOVING_TODAY_SLOT_CLASS}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{MOVING_TODAY_TITLE}</h2>
            {status === "ready" && dateLabel ? (
              <p className="text-xs text-zinc-500">{dateLabel}</p>
            ) : (
              <div className="mt-1 h-3 w-16 animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]" />
            )}
          </div>
          {status === "ready" ? (
            <ShareIconButton path={MOVING_TODAY_PATH} title={MOVING_TODAY_TITLE} label="Share" />
          ) : (
            <div className="h-11 w-11 shrink-0" />
          )}
        </div>
        {status === "loading" ? (
          <SkeletonRows />
        ) : (
          <ul>
            {sales.map((sale) => (
              <li key={`${sale.cardId}-${sale.soldOn}-${sale.priceCents}`}>
                <Link href={sale.href} className="flex min-h-11 items-center gap-2 py-1">
                  <CardThumb
                    card={{
                      playerName: sale.player,
                      photoDataUrl: sale.imageUrl,
                      accent: sale.accent,
                    }}
                    className="h-10 w-8 shrink-0 rounded-md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{sale.player}</span>
                    {sale.detail ? (
                      <span className="block truncate text-xs text-zinc-500">{sale.detail}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{sale.priceLabel}</span>
                    {sale.percentLabel ? (
                      <span className={`block text-xs font-semibold tabular-nums ${percentClass(sale.percent)}`}>
                        {sale.percentLabel}
                      </span>
                    ) : null}
                    <span className="block text-[11px] text-zinc-500">{sale.soldLabel}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function MovingToday() {
  const [view, setView] = useState<{
    status: PanelStatus | "empty";
    dateLabel: string;
    sales: MovingTodaySale[];
  }>({ status: "loading", dateLabel: "", sales: [] });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/moving-today", { signal: controller.signal });
        if (!response.ok) throw new Error("Moving today unavailable");
        const payload = (await response.json()) as MovingTodayPayload;
        if (cancelled) return;
        if (!shouldShowMovingToday(payload.sales)) {
          setView({ status: "empty", dateLabel: "", sales: [] });
          return;
        }
        setView({
          status: "ready",
          dateLabel: payload.dateLabel,
          sales: payload.sales,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setView({ status: "empty", dateLabel: "", sales: [] });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (view.status === "empty") return null;
  return <MovingTodayPanel status={view.status} dateLabel={view.dateLabel} sales={view.sales} />;
}
