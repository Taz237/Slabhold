"use client";

import { useEffect, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { TrendingNowStrip } from "@/components/trending-now-strip";
import {
  filterTrendingForViewer,
  trendingItemsFromPayload,
  type TrendingItem,
} from "@/lib/social/trending";

/**
 * For You only. The ranking is fetched from the cached route so the home
 * page does not run the engagement queries, and so /login does not load this.
 */
export function TrendingNow() {
  const { ready, blockedIds, mutedIds } = useSocial();
  const [items, setItems] = useState<TrendingItem[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/trending-now", { signal: controller.signal });
        if (!response.ok) throw new Error("Trending now unavailable");
        const payload: unknown = await response.json();
        if (cancelled) return;
        setItems(trendingItemsFromPayload(payload));
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItems([]);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (!ready || !items) return null;
  const visible = filterTrendingForViewer(items, { blockedIds, mutedIds });
  if (visible.length === 0) return null;
  return <TrendingNowStrip items={visible} />;
}
