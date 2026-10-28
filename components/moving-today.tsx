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
  if (percent == null || percent === 0) return "bg-black/60 text-zinc-200";
  if (percent > 0) return "bg-black/60 text-emerald-300";
  return "bg-black/60 text-rose-300";
}

/** Recent sales as a swipeable rail of slab cards. The next card peeks in. */
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
      className="border-b border-zinc-200/70 py-4 dark:border-white/[0.07]"
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight">{heading}</h2>
          {dateLabel ? (
            <p className="font-mono text-[11px] tracking-wider text-zinc-500 uppercase">{dateLabel}</p>
          ) : null}
        </div>
        <ShareIconButton path={MOVING_TODAY_PATH} title={heading} label="Share" />
      </div>
      <ul
        data-no-pull=""
        className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 max-md:pr-20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sales.map((sale) => (
          <li
            key={`${sale.cardId}-${sale.soldOn}-${sale.priceCents}`}
            className="w-[38%] max-w-44 min-w-32 shrink-0 snap-start"
          >
            <Link
              href={sale.href}
              className="block rounded-2xl border border-zinc-200 bg-white p-2 transition-transform duration-150 active:scale-[0.97] motion-reduce:transform-none dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="relative block aspect-[5/7] overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
                <CardThumb
                  card={{
                    playerName: sale.player,
                    photoDataUrl: sale.imageUrl,
                    accent: sale.accent,
                  }}
                  className="h-full w-full"
                />
                {sale.percentLabel ? (
                  <span
                    className={`absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${percentClass(sale.percent)}`}
                  >
                    {sale.percentLabel}
                  </span>
                ) : null}
              </span>
              <span className="mt-2 block truncate text-sm font-semibold tracking-tight">{sale.player}</span>
              {sale.detail ? (
                <span className="block truncate text-xs text-zinc-500">{sale.detail}</span>
              ) : null}
              <span className="mt-1 flex items-baseline justify-between gap-1.5">
                <span className="truncate text-sm font-bold tracking-tight tabular-nums">{sale.priceLabel}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{sale.soldLabel}</span>
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
