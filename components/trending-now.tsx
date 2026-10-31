"use client";

import { useEffect, useState } from "react";
import { useSocial } from "@/components/social-provider";
import { TrendingNowSkeleton, TrendingNowStrip } from "@/components/trending-now-strip";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  filterTrendingForViewer,
  rememberTrendingPublic,
  rememberTrendingVisible,
  trendingItemsFromPayload,
  trendingPublicSession,
  trendingVisibleSession,
  type TrendingItem,
} from "@/lib/social/trending";

type VisiblePosts = { viewerId: string; ids: string[] };

/**
 * For You only. The ranking comes from the shared cached route.
 * A signed-in viewer then keeps the post ids their own client can read.
 * The last successful payload is reused for the session, including when
 * this unmounts on Following and mounts again on For You.
 */
export function TrendingNow() {
  const { ready, blockedIds, mutedIds, user } = useSocial();
  const viewerId = user?.id ?? null;
  const [items, setItems] = useState<TrendingItem[] | null>(() => trendingPublicSession());
  const [visible, setVisible] = useState<VisiblePosts | null>(null);

  useEffect(() => {
    if (trendingPublicSession() !== null) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/trending-now", { signal: controller.signal });
        if (!response.ok) throw new Error("Trending now unavailable");
        const payload: unknown = await response.json();
        if (cancelled) return;
        const next = trendingItemsFromPayload(payload);
        rememberTrendingPublic(next);
        setItems(next);
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

  useEffect(() => {
    if (!viewerId || !items || items.length === 0) return;
    if (trendingVisibleSession(viewerId)) return;
    let cancelled = false;
    const postIds = items.map((item) => item.id);
    void (async () => {
      try {
        const supabase = createSupabaseBrowser();
        let ids = postIds;
        if (supabase) {
          const { data, error } = await supabase.from("posts").select("id").in("id", postIds);
          if (error) throw new Error(error.message);
          const allowed = new Set(postIds);
          ids = [];
          for (const row of data ?? []) {
            if (allowed.has(row.id)) ids.push(row.id);
          }
        } else {
          await Promise.resolve();
        }
        if (cancelled) return;
        rememberTrendingVisible(viewerId, ids);
        setVisible({ viewerId, ids });
      } catch {
        if (cancelled) return;
        setVisible({ viewerId, ids: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId, items]);

  if (!ready || items === null) return <TrendingNowSkeleton />;

  const sessionIds = viewerId ? trendingVisibleSession(viewerId) : null;
  const resolvedIds = !viewerId ? null : (sessionIds ?? (visible?.viewerId === viewerId ? visible.ids : null));

  if (viewerId && items.length > 0 && resolvedIds === null) return <TrendingNowSkeleton />;

  const shown = filterTrendingForViewer(items, {
    blockedIds,
    mutedIds,
    visibleIds: viewerId ? new Set(resolvedIds ?? []) : null,
  });
  if (shown.length === 0) return null;
  return <TrendingNowStrip items={shown} />;
}
