"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardThumb } from "@/components/card-thumb";
import { ShareIconButton } from "@/components/share-button";
import { freshenMovingToday } from "@/lib/moving-today/rank";
import {
  MOVING_TODAY_PATH,
  shouldShowMovingToday,
  type MovingTodayPayload,
  type MovingTodaySale,
} from "@/lib/moving-today/types";

function percentClass(percent: number | null): string {
  if (percent == null || percent === 0) return "text-zinc-500";
  if (percent > 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-rose-600 dark:text-rose-400";
}

export function MovingTodayPanel({
  heading,
  dateLabel,
  sales,
}: {
  heading: string;
  dateLabel: string;
  sales: MovingTodaySale[];
}) {
  if (!shouldShowMovingToday(sales)) return null;

  return (
    <section
      aria-label={heading}
      data-moving-today=""
      className="border-b border-zinc-200 px-4 py-3 dark:border-white/10"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{heading}</h2>
          {dateLabel ? <p className="text-xs text-zinc-500">{dateLabel}</p> : null}
        </div>
        <ShareIconButton path={MOVING_TODAY_PATH} title={heading} label="Share" />
      </div>
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
    </section>
  );
}

/** Renders the heading the server already computed, so midnight does not mismatch. */
export function MovingTodayCached({ payload }: { payload: MovingTodayPayload }) {
  if (!shouldShowMovingToday(payload.sales)) return null;
  return <MovingTodayPanel heading={payload.title} dateLabel={payload.dateLabel} sales={payload.sales} />;
}

export function MovingToday() {
  const [view, setView] = useState<MovingTodayPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/moving-today", { signal: controller.signal });
        if (!response.ok) throw new Error("Moving today unavailable");
        const payload = freshenMovingToday((await response.json()) as MovingTodayPayload);
        if (cancelled) return;
        setView(shouldShowMovingToday(payload.sales) ? payload : null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setView(null);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (!view) return null;
  return <MovingTodayPanel heading={view.title} dateLabel={view.dateLabel} sales={view.sales} />;
}
