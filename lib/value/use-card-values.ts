"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardValueResult } from "./types";

const emptyMap = new Map<string, CardValueResult>();

/**
 * Load trusted values for many cards in one request (no Trawl).
 */
export function useCardValues(cardIds: string[]) {
  const key = useMemo(() => {
    const ids = [...new Set(cardIds.filter(Boolean))].sort();
    return ids.join(",");
  }, [cardIds]);

  const [values, setValues] = useState<Map<string, CardValueResult>>(emptyMap);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) {
      setValues(emptyMap);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/card-values?ids=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const body = (await res.json()) as {
          values?: Record<string, CardValueResult>;
        };
        if (controller.signal.aborted) return;
        const next = new Map<string, CardValueResult>();
        for (const [id, value] of Object.entries(body.values ?? {})) {
          next.set(id, value);
        }
        setValues(next);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setValues(emptyMap);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [key]);

  return { values, loading };
}

export function useCardValue(cardId: string | null) {
  const ids = useMemo(() => (cardId ? [cardId] : []), [cardId]);
  const { values, loading } = useCardValues(ids);
  return {
    value: cardId ? (values.get(cardId) ?? null) : null,
    loading,
  };
}

/** Fire-and-forget background refresh (does not await Trawl). */
export function scheduleCardValueRefresh(cardId: string) {
  if (!cardId) return;
  void fetch("/api/card-values/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: cardId }),
  }).catch(() => {
    /* ignore */
  });
}
