"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MoverTile, RAIL_LIST, TileSkeleton } from "@/components/moving-today";
import { freshenMovingToday } from "@/lib/moving-today/rank";
import { MOVING_TODAY_PATH, shouldShowMovingToday, type MovingTodayPayload, type MovingTodaySale } from "@/lib/moving-today/types";
import { focusRing, textMuted } from "./tokens";

export const RAIL_TITLE = "Moving on Slabhold";
export const RAIL_LIMIT = 10;

/**
 * Real public cards only, straight from the Moving today read the Home feed
 * already caches: the biggest moves on recent sold prices, then the newest
 * public cards. Nothing to show is no rail, never sample tiles.
 */
export function railSales(payload: unknown): MovingTodaySale[] {
  if (!payload || typeof payload !== "object") return [];
  const sales = (payload as MovingTodayPayload).sales;
  return shouldShowMovingToday(sales) ? sales.slice(0, RAIL_LIMIT) : [];
}

function RailHeader() {
  return (
    <div className="flex h-11 items-center justify-between px-4">
      <h2 className="text-17 leading-6 font-semibold">{RAIL_TITLE}</h2>
      <Link
        href={MOVING_TODAY_PATH}
        className={`-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-[10px] px-2 text-13 font-medium ${textMuted} hover:text-zinc-950 dark:hover:text-zinc-50 ${focusRing}`}
      >
        See all
        <ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} />
      </Link>
    </div>
  );
}

/** A swipeable row of public card tiles. Bleeds to the page edge, like Home's rail. */
export function SlabholdRail() {
  const [sales, setSales] = useState<MovingTodaySale[] | "loading">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/moving-today", { signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const payload = freshenMovingToday((await response.json()) as MovingTodayPayload);
        setSales(railSales(payload));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSales([]);
      }
    })();
    return () => controller.abort();
  }, []);

  if (sales !== "loading" && sales.length === 0) return null;
  return (
    <section data-quick-comp-rail={sales === "loading" ? "loading" : "ready"} aria-label={RAIL_TITLE} aria-busy={sales === "loading" || undefined} className="-mx-4">
      <RailHeader />
      {sales === "loading" ? (
        <ul aria-hidden="true" className={`${RAIL_LIST} overflow-x-hidden`}>
          {[0, 1, 2, 3].map((n) => (
            <TileSkeleton key={n} top={false} />
          ))}
        </ul>
      ) : (
        <ul className={RAIL_LIST}>
          {sales.map((sale, index) => (
            <MoverTile key={sale.cardId} sale={sale} index={index} variant="rail" prefetch={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
