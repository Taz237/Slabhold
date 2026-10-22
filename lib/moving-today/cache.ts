/** Server cache window for Moving today. About 30 minutes. */
export const MOVING_TODAY_CACHE_SECONDS = 30 * 60;

export function movingTodayCacheControl(): string {
  return `public, max-age=0, s-maxage=${MOVING_TODAY_CACHE_SECONDS}, stale-while-revalidate=60`;
}

type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

export type TtlCache<T> = {
  read(load: () => Promise<T>): Promise<T>;
};

/**
 * In-process read-through cache. A failed load is not stored.
 * Calls that overlap one miss share that load.
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  let entry: CacheEntry<T> | null = null;
  let pending: Promise<T> | null = null;

  return {
    read(load) {
      if (entry && now() - entry.storedAt < ttlMs) return Promise.resolve(entry.value);
      if (pending) return pending;
      const run = load()
        .then((value) => {
          entry = { value, storedAt: now() };
          pending = null;
          return value;
        })
        .catch((error: unknown) => {
          pending = null;
          throw error;
        });
      pending = run;
      return run;
    },
  };
}
