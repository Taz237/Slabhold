import { CACHE_TTL_MS } from "@/lib/comps/cache-ttl";
import { quickCompIdentityKey, type QuickCompIdentity } from "./identity";
import type { QuickCompLimitReason } from "./limits";

export const QUICK_COMP_CACHE_TAG = "quick-comp";
/** Six hours, the same freshness as the card page's sold comps. */
export const QUICK_COMP_REVALIDATE_SECONDS = CACHE_TTL_MS / 1000;

/** Shared across users: the key has no user id, so a hit is free for everyone. */
export function quickCompCacheKey(identity: QuickCompIdentity): string {
  return `quick-comp-v1|${quickCompIdentityKey(identity)}`;
}

/** Thrown from inside the loader so the cache never stores it. */
export class QuickCompFailure extends Error {
  readonly kind: QuickCompLimitReason | "unavailable";
  readonly resetAt: string | null;

  constructor(kind: QuickCompLimitReason | "unavailable", resetAt: string | null = null) {
    super(kind);
    this.name = "QuickCompFailure";
    this.kind = kind;
    this.resetAt = resetAt;
  }
}

/** The shape of next/cache `unstable_cache`, injected so tests use a Map. */
export type CacheFn = <T>(
  load: () => Promise<T>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number },
) => () => Promise<T>;

/**
 * One shared read-through entry per identity. The cap and Trawl run inside
 * `load`, so only a miss spends anything. A throw is never stored.
 */
export function loadSharedQuickComp<T>(
  identity: QuickCompIdentity,
  load: () => Promise<T>,
  cache: CacheFn,
): Promise<T> {
  return cache(load, [quickCompCacheKey(identity)], {
    tags: [QUICK_COMP_CACHE_TAG],
    revalidate: QUICK_COMP_REVALIDATE_SECONDS,
  })();
}
