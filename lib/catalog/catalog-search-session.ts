import { resolveCatalogSearch, type CatalogCard } from "@/lib/card-catalog";

/** Stop waiting on search_cards and use the seed catalog. */
export const CATALOG_SEARCH_TIMEOUT_MS = 6_000;

/** Shown with a retry when search_cards times out or errors and nothing local matched. */
export const CATALOG_SEARCH_TIMEOUT_MESSAGE = "Search is taking too long. Try again";

/** Same pause Card Search already used before calling search_cards. */
export const CATALOG_SEARCH_DEBOUNCE_MS = 250;

export type CatalogSearchSnapshot = {
  results: CatalogCard[];
  /** Null means error, timeout, or offline. An empty array is a real miss. */
  remote: CatalogCard[] | null;
  loading: boolean;
  aborted: boolean;
  timedOut: boolean;
};

/**
 * One Add card catalog search.
 * A hung search_cards call becomes a null remote after timeoutMs, so the seed
 * fallback runs and loading ends. abort() drops a debounced or in-flight call
 * so a late response cannot replace a newer query.
 */
export function loadCatalogSearchSession(options: {
  query: string;
  search: (query: string, signal: AbortSignal) => Promise<CatalogCard[] | null>;
  timeoutMs?: number;
  debounceMs?: number;
  limit?: number;
}): { done: Promise<CatalogSearchSnapshot>; abort: () => void } {
  const timeoutMs = options.timeoutMs ?? CATALOG_SEARCH_TIMEOUT_MS;
  const debounceMs = options.debounceMs ?? CATALOG_SEARCH_DEBOUNCE_MS;
  const limit = options.limit ?? 20;
  const cancel = new AbortController();
  const rpc = new AbortController();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  const done = new Promise<CatalogSearchSnapshot>((resolve) => {
    let settled = false;
    const finish = (snapshot: CatalogSearchSnapshot) => {
      if (settled) return;
      settled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve(snapshot);
    };

    const onCancel = () => {
      rpc.abort();
      finish({
        results: [],
        remote: null,
        loading: false,
        aborted: true,
        timedOut: false,
      });
    };
    if (cancel.signal.aborted) {
      onCancel();
      return;
    }
    cancel.signal.addEventListener("abort", onCancel, { once: true });

    debounceTimer = setTimeout(() => {
      if (cancel.signal.aborted) return;

      let timedOut = false;
      const timeoutResult = new Promise<null>((resolveTimeout) => {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          rpc.abort();
          resolveTimeout(null);
        }, timeoutMs);
      });

      const work = options.search(options.query, rpc.signal).then(
        (remote) => remote,
        () => null as CatalogCard[] | null,
      );

      void Promise.race([work, timeoutResult]).then((remote) => {
        if (cancel.signal.aborted) return;
        const value = timedOut ? null : remote;
        finish({
          results: resolveCatalogSearch(options.query, value, limit),
          remote: value,
          loading: false,
          aborted: false,
          timedOut,
        });
      });
    }, debounceMs);
  });

  return {
    done,
    abort() {
      cancel.abort();
    },
  };
}

/**
 * True when the search failed and the seed fallback is empty.
 * A real miss (remote []) stays false so the empty state can offer Add card.
 * Seed matches stay false so a timeout still shows those cards.
 */
export function catalogSearchNeedsRetry(snapshot: Pick<
  CatalogSearchSnapshot,
  "aborted" | "timedOut" | "remote" | "results"
>): boolean {
  if (snapshot.aborted) return false;
  if (snapshot.results.length > 0) return false;
  return snapshot.timedOut || snapshot.remote === null;
}
