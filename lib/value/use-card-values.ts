"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_CARD_VALUE_IDS } from "./card-value-access";
import type { CardValueResult } from "./types";

const emptyMap = new Map<string, CardValueResult>();

/** One automatic retry after a failed card-value read. */
export const CARD_VALUES_RETRY_MS = 2000;

/**
 * A failed read (non-OK, 429, network) keeps the last good map.
 * Callers surface `error` instead of treating the miss as $0.
 */
export function cardValuesAfterFailure<T>(previous: Map<string, T>): Map<string, T> {
  return previous;
}

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
 * Failures keep the previous map, set `error`, and retry once.
 */
export function useCardValues(cardIds: string[]) {
  const key = useMemo(() => {
    const ids = [...new Set(cardIds.filter(Boolean))].sort();
    return ids.join(",");
  }, [cardIds]);

  const [values, setValues] = useState<Map<string, CardValueResult>>(emptyMap);
  /** Last key whose fetch settled — keeps loading true on first paint / key change. */
  const [settledKey, setSettledKey] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!key) {
      setValues(emptyMap);
      setSettledKey("");
      setError(false);
      setPending(false);
      return;
    }

    const controller = new AbortController();
    let retryTimer = 0;
    let cancelled = false;
    setPending(true);

    const settle = (failed: boolean) => {
      if (cancelled) return;
      setPending(false);
      setError(failed);
      setSettledKey(key);
    };

    const run = (isRetry: boolean) => {
      loadCardValues(key, controller.signal)
        .then((next) => {
          if (cancelled || controller.signal.aborted) return;
          setValues(next);
          settle(false);
        })
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setValues((current) => cardValuesAfterFailure(current));
          if (!isRetry) {
            retryTimer = window.setTimeout(() => {
              if (!cancelled) run(true);
            }, CARD_VALUES_RETRY_MS);
            return;
          }
          settle(true);
        });
    };

    run(false);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      controller.abort();
    };
  }, [attempt, key]);

  const loading = Boolean(key) && (settledKey !== key || pending);

  return { values, loading, error, retry };
}

export function useCardValue(cardId: string | null) {
  const ids = useMemo(() => (cardId ? [cardId] : []), [cardId]);
  const { values, loading, error, retry } = useCardValues(ids);
  return {
    value: cardId ? (values.get(cardId) ?? null) : null,
    loading,
    error,
    retry,
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
