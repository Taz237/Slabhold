import type { CacheFn } from "@/lib/quick-comp/cache";
import { QUICK_COMP_CACHE_TAG, QUICK_COMP_REVALIDATE_SECONDS, QuickCompFailure } from "@/lib/quick-comp/cache";
import { spendQuickCompLookup, type QuickCompLimitDeps } from "@/lib/quick-comp/limits";
import type { TrawlSoldResult } from "@/lib/comps/types";
import type { LiveSearchResult } from "./live-solds";

/**
 * The scan's one live eBay sold search, through our existing Trawl path. The
 * same shape as Quick Comp: details=1, max_pages=1 (2 credits, 0 when nothing
 * matches), the last 90 days. Shared per query for 6 hours (Quick Comp's cache
 * tag and freshness), so the same search from anyone is free after the first.
 * The caps are Quick Comp's own and are spent only on a miss, right before
 * Trawl: 10 a day, then the shared 5 an hour.
 */

export const LIVE_SEARCH_DAYS = 90;
export const LIVE_SEARCH_MAX_PAGES = 1;
/** Most results kept per search. One page is about 50. */
const MAX_RESULTS = 100;

export type LiveSearchDeps = {
  /** "trawl" only. Sample and off never search. */
  source: () => string;
  hasTrawlKey: () => boolean;
  fetchSold: (
    query: string,
    options: { days: number; maxPages: number },
  ) => Promise<{ ok: true; body: { results?: TrawlSoldResult[] } } | { ok: false; status?: number; error?: string; outOfCredits?: boolean }>;
  limits: QuickCompLimitDeps;
  cache: CacheFn;
  now: () => number;
  /** Waits before the one retry of a throttled or failed search. */
  sleep?: (ms: number) => Promise<void>;
  /** A failed search, logged in production too: the query (card names only) and why. Never a user or the key. */
  warn?: (event: { query: string; status: number; reason: string; retried: boolean }) => void;
};

/** A 429 or a 5xx gets one more try, this long after. */
export const LIVE_SEARCH_RETRY_MS = 400;

/**
 * Trawl's answer to a spent account: a 429 with no Retry-After (Trawl's own outOfCredits), or an
 * error that says credits or quota. Retrying only spends another call; the sheet says it plainly.
 */
function outOfCredits(result: { status?: number; error?: string; outOfCredits?: boolean }): boolean {
  if (result.status !== 429) return false;
  return Boolean(result.outOfCredits) || /\b(?:credits?|quota)\b/i.test(result.error ?? "");
}

/** A throttled search or a server error: worth one more try. Never an account that's out of credits. */
function retryable(result: { status?: number; error?: string; outOfCredits?: boolean }): boolean {
  const status = result.status;
  if (outOfCredits(result)) return false;
  return status === 429 || (status != null && status >= 500 && status < 600);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** The server passes a real logger (live-solds-server.ts); tests and other callers stay quiet. */
const defaultWarn: NonNullable<LiveSearchDeps["warn"]> = () => {};

/** Case and spacing don't make a new search. */
export function liveSearchKey(query: string): string {
  return `scan-live-v1|${query.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/** Only what the filters and the photo use, so a cached search stays small. */
function compact(result: TrawlSoldResult): TrawlSoldResult {
  const details = result.details
    ? {
        listing_state: result.details.listing_state ?? null,
        grading: result.details.grading ?? null,
        sale_price: result.details.sale_price ?? null,
        best_offer_accepted: result.details.best_offer_accepted ?? null,
        sales: result.details.sales ?? null,
        item_link: result.details.item_link ?? null,
        images: Array.isArray(result.details.images) ? result.details.images.slice(0, 2) : null,
      }
    : null;
  return {
    title: result.title,
    sale_price: result.sale_price,
    shipping_price: result.shipping_price ?? null,
    currency: result.currency,
    condition: result.condition,
    condition_raw: result.condition_raw ?? null,
    date_sold: result.date_sold,
    buying_format: result.buying_format,
    item_id: result.item_id,
    item_link: result.item_link,
    image_url: result.image_url ?? null,
    details,
  };
}

type Cached = { results: TrawlSoldResult[]; fetchedAt: string };

/**
 * One scan's lookup across the ladder's rungs. The caps are spent once, on the
 * first rung that misses the cache; later rungs ride on it. At most
 * MAX_LOOKUP_CALLS Trawl calls per lookup, whatever happens.
 */
export type LookupBudget = { spent: boolean; calls: number };
export const MAX_LOOKUP_CALLS = 4;

export function newLookupBudget(): LookupBudget {
  return { spent: false, calls: 0 };
}

export function makeLiveSearch(deps: LiveSearchDeps) {
  return async function liveSearch(
    query: string,
    userId: string,
    budget: LookupBudget = newLookupBudget(),
  ): Promise<LiveSearchResult> {
    if (deps.source() !== "trawl" || !deps.hasTrawlKey() || !query.trim()) return { ok: false, reason: "unavailable" };
    try {
      const cached = await deps.cache<Cached>(
        async () => {
          if (budget.calls >= MAX_LOOKUP_CALLS) throw new QuickCompFailure("unavailable");
          if (!budget.spent) {
            const spent = await spendQuickCompLookup(userId, { ...deps.limits, now: deps.now });
            if (!spent.ok) throw new QuickCompFailure(spent.reason, spent.resetAt);
            budget.spent = true;
          }
          const fetchOnce = () => {
            budget.calls += 1;
            return deps.fetchSold(query, { days: LIVE_SEARCH_DAYS, maxPages: LIVE_SEARCH_MAX_PAGES });
          };
          let result = await fetchOnce();
          // Throttled or a server error: one more try, still inside the lookup's call cap.
          if (!result.ok && retryable(result) && budget.calls < MAX_LOOKUP_CALLS) {
            (deps.warn ?? defaultWarn)({ query, status: result.status ?? 0, reason: result.error ?? "failed", retried: false });
            await (deps.sleep ?? defaultSleep)(LIVE_SEARCH_RETRY_MS);
            result = await fetchOnce();
            if (!result.ok) (deps.warn ?? defaultWarn)({ query, status: result.status ?? 0, reason: result.error ?? "failed", retried: true });
          } else if (!result.ok) {
            (deps.warn ?? defaultWarn)({ query, status: result.status ?? 0, reason: result.error ?? "failed", retried: false });
          }
          if (!result.ok) throw new QuickCompFailure("unavailable");
          const results = (result.body.results ?? []).filter(Boolean).slice(0, MAX_RESULTS).map(compact);
          return { results, fetchedAt: new Date(deps.now()).toISOString() };
        },
        [liveSearchKey(query)],
        { tags: [QUICK_COMP_CACHE_TAG], revalidate: QUICK_COMP_REVALIDATE_SECONDS },
      )();
      return { ok: true, results: cached.results, fetchedAt: cached.fetchedAt };
    } catch (error) {
      if (error instanceof QuickCompFailure && error.kind !== "unavailable" && error.resetAt) {
        return { ok: false, reason: error.kind, resetAt: error.resetAt };
      }
      return { ok: false, reason: "unavailable" };
    }
  };
}

/** A search already in the shared cache, or null. Never spends a cap, never calls Trawl. */
export function makeLiveCacheRead(cache: CacheFn) {
  return async function readLiveCache(query: string): Promise<TrawlSoldResult[] | null> {
    if (!query.trim()) return null;
    try {
      const cached = await cache<Cached>(
        async () => {
          throw new QuickCompFailure("unavailable");
        },
        [liveSearchKey(query)],
        { tags: [QUICK_COMP_CACHE_TAG], revalidate: QUICK_COMP_REVALIDATE_SECONDS },
      )();
      return cached.results;
    } catch {
      return null;
    }
  };
}
