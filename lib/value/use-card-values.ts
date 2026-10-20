"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_CARD_VALUE_IDS } from "./card-value-access";
import { PRICE_CHECK_LIMIT_MESSAGE } from "./price-check-limit";
import type { CardValueResult } from "./types";

export { PRICE_CHECK_LIMIT_MESSAGE };

const emptyMap = new Map<string, CardValueResult>();

/** One automatic retry after a failed card-value read. Not used for 429 or timeout. */
export const CARD_VALUES_RETRY_MS = 2000;

/** A hung card-value read is a failure. It does not stay loading. */
export const CARD_VALUES_TIMEOUT_MS = 10_000;

/** Requests stay quiet until a returned Retry-After window has passed. */
let rateLimitedUntil = 0;

export function resetCardValuesRateLimit(): void {
  rateLimitedUntil = 0;
}

function noteRetryAfter(header: string | null): void {
  if (header == null || header.trim() === "") return;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  rateLimitedUntil = Date.now() + seconds * 1000;
}

/**
 * A failed read (non-OK, 429, network, timeout) keeps the last good map.
 * Callers surface `error` instead of treating the miss as $0.
 */
export function cardValuesAfterFailure<T>(previous: Map<string, T>): Map<string, T> {
  return previous;
}

export class CardValuesRateLimitError extends Error {
  constructor() {
    super(PRICE_CHECK_LIMIT_MESSAGE);
    this.name = "CardValuesRateLimitError";
  }
}

async function loadCardValues(
  key: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Map<string, CardValueResult>> {
  const ids = key.split(",").filter(Boolean);
  const next = new Map<string, CardValueResult>();
  for (let index = 0; index < ids.length; index += MAX_CARD_VALUE_IDS) {
    if (signal.aborted) {
      const aborted = new Error("aborted");
      aborted.name = "AbortError";
      throw aborted;
    }
    if (Date.now() < rateLimitedUntil) throw new CardValuesRateLimitError();
    const batch = ids.slice(index, index + MAX_CARD_VALUE_IDS).join(",");
    const res = await fetchImpl(`/api/card-values?ids=${encodeURIComponent(batch)}`, {
      signal,
    });
    if (res.status === 429) {
      noteRetryAfter(res.headers.get("Retry-After"));
      throw new CardValuesRateLimitError();
    }
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

export type CardValuesSessionResult = {
  loading: boolean;
  error: boolean;
  values: Map<string, CardValueResult>;
  message: string | null;
};

/**
 * Load trusted values for many cards (no Trawl). Requests stay at 100 ids.
 * Failures keep the previous map and set `error`. A 429 is not retried.
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const valuesRef = useRef(values);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (!key) {
      setValues(emptyMap);
      setSettledKey("");
      setError(false);
      setErrorMessage(null);
      setPending(false);
      return;
    }

    let cancelled = false;
    setPending(true);
    const session = loadCardValuesSession({
      key,
      previous: valuesRef.current,
    });

    session.done.then((result) => {
      if (cancelled) return;
      setPending(false);
      setError(result.error);
      setErrorMessage(result.message);
      setSettledKey(key);
      if (result.error) setValues((current) => cardValuesAfterFailure(current));
      else setValues(result.values);
    }).catch(() => {
      if (cancelled) return;
      setValues((current) => cardValuesAfterFailure(current));
      setPending(false);
      setError(true);
      setErrorMessage(null);
      setSettledKey(key);
    });

    return () => {
      cancelled = true;
      session.abort();
    };
  }, [attempt, key]);

  const loading = Boolean(key) && (settledKey !== key || pending);

  return { values, loading, error, errorMessage, retry };
}

export function loadCardValuesSession(options: {
  key: string;
  previous: Map<string, CardValueResult>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryMs?: number;
}): { done: Promise<CardValuesSessionResult>; abort: () => void } {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? CARD_VALUES_TIMEOUT_MS;
  const retryMs = options.retryMs ?? CARD_VALUES_RETRY_MS;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | null = null;

  const done = new Promise<CardValuesSessionResult>((resolve) => {
    const finish = (
      failed: boolean,
      next: Map<string, CardValueResult>,
      message: string | null,
    ) => {
      if (stopped) return;
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve({
        loading: false,
        error: failed,
        values: next,
        message,
      });
    };

    const run = (isRetry: boolean) => {
      if (stopped) return;
      const controller = new AbortController();
      active = controller;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      loadCardValues(options.key, controller.signal, fetchImpl)
        .then((next) => {
          if (stopped || controller !== active) return;
          if (controller.signal.aborted) {
            finish(true, cardValuesAfterFailure(options.previous), null);
            return;
          }
          finish(false, next, null);
        })
        .catch((err: unknown) => {
          if (stopped || controller !== active) return;
          if (timeoutTimer) clearTimeout(timeoutTimer);
          const rateLimited = err instanceof CardValuesRateLimitError;
          const timedOut = controller.signal.aborted;
          if (!rateLimited && !timedOut && !isRetry) {
            retryTimer = setTimeout(() => run(true), retryMs);
            return;
          }
          finish(
            true,
            cardValuesAfterFailure(options.previous),
            rateLimited ? PRICE_CHECK_LIMIT_MESSAGE : null,
          );
        });
    };

    run(false);
  });

  return {
    done,
    abort() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      active?.abort();
    },
  };
}

export function useCardValue(cardId: string | null) {
  const ids = useMemo(() => (cardId ? [cardId] : []), [cardId]);
  const { values, loading, error, errorMessage, retry } = useCardValues(ids);
  return {
    value: cardId ? (values.get(cardId) ?? null) : null,
    loading,
    error,
    errorMessage,
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
