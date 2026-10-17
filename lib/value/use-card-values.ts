"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_CARD_VALUE_IDS } from "./card-value-access";
import type { CardValueResult } from "./types";

const emptyMap = new Map<string, CardValueResult>();

async function loadCardValues(
  key: string,
  signal: AbortSignal,
): Promise<Map<string, CardValueResult>> {
  const ids = key.split(",").filter(Boolean);
  const next = new Map<string, CardValueResult>();
  for (let index = 0; index < ids.length; index += MAX_CARD_VALUE_IDS) {
    if (signal.aborted) return next;
    const batch = ids.slice(index, index + MAX_CARD_VALUE_IDS).join(",");
    const res = await fetch(`/api/card-values?ids=${encodeURIComponent(batch)}`, {
      signal,
    });
    if (!res.ok) throw new Error("failed");
    const body = (await res.json()) as {
      values?: Record<string, CardValueResult>;
    };
    for (const [id, value] of Object.entries(body.values ?? {})) {
      next.set(id, value);
    }
  }
  return next;
}

/**
 * Load trusted values for many cards (no Trawl). Requests stay at 100 ids.
 */
export function useCardValues(cardIds: string[]) {
  const key = useMemo(() => {
    const ids = [...new Set(cardIds.filter(Boolean))].sort();
    return ids.join(",");
  }, [cardIds]);

  const [values, setValues] = useState<Map<string, CardValueResult>>(emptyMap);
  /** Last key whose fetch settled — keeps loading true on first paint / key change. */
  const [settledKey, setSettledKey] = useState("");

  useEffect(() => {
    if (!key) {
      setValues(emptyMap);
      setSettledKey("");
      return;
    }

    const controller = new AbortController();

    loadCardValues(key, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setValues(next);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setValues(emptyMap);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledKey(key);
      });

    return () => controller.abort();
  }, [key]);

  const loading = Boolean(key) && settledKey !== key;

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
