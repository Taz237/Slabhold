/** Server cache window for Moving today. About 30 minutes. */
export const MOVING_TODAY_CACHE_SECONDS = 30 * 60;

/** A failed read is remembered briefly so an outage is not queried on every visit. */
export const MOVING_TODAY_ERROR_CACHE_MS = 60 * 1000;

export function movingTodayCacheControl(): string {
  return `public, max-age=0, s-maxage=${MOVING_TODAY_CACHE_SECONDS}, stale-while-revalidate=60`;
}

type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

type FailedRead = {
  error: unknown;
  storedAt: number;
};

export type TtlCache<T> = {
  read(load: () => Promise<T>): Promise<T>;
};

/**
 * In-process read-through cache. A successful value, including an empty list,
 * is kept for `ttlMs`. A failed load is kept only when `errorTtlMs` is set,
 * and then it is rethrown without calling `load` again. Calls that overlap
 * one miss share that load.
 */
export function createTtlCache<T>(
  ttlMs: number,
  now: () => number = Date.now,
  errorTtlMs = 0,
): TtlCache<T> {
  let entry: CacheEntry<T> | null = null;
  let failure: FailedRead | null = null;
  let pending: Promise<T> | null = null;

  return {
    read(load) {
      if (entry && now() - entry.storedAt < ttlMs) return Promise.resolve(entry.value);
      if (failure && errorTtlMs > 0 && now() - failure.storedAt < errorTtlMs) {
        return Promise.reject(failure.error);
      }
      if (pending) return pending;
      const run = load()
        .then((value) => {
          entry = { value, storedAt: now() };
          failure = null;
          pending = null;
          return value;
        })
        .catch((error: unknown) => {
          pending = null;
          if (errorTtlMs > 0) failure = { error, storedAt: now() };
          throw error;
        });
      pending = run;
      return run;
    },
  };
}
