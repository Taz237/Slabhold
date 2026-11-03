/** Fresh Trawl lookups a user may start from Quick Comp per UTC day. */
export const QUICK_COMP_DAILY_LIMIT = 10;
/** Free-text bucket in comps_rate_limits. No migration needed. */
export const QUICK_COMP_DAY_BUCKET = "quick_comp_day";
/** 24h, so the window aligns to UTC midnight (7 PM ET in winter, 8 PM in summer). */
export const QUICK_COMP_DAY_MS = 24 * 60 * 60 * 1000;
/** Same as lib/comps/rate-limit TRAWL_WINDOW_MS (kept here to stay out of server-only). */
export const QUICK_COMP_HOUR_MS = 60 * 60 * 1000;

export type QuickCompLimitReason = "daily" | "hourly";

export type QuickCompLimitResult =
  | { ok: true }
  | { ok: false; reason: QuickCompLimitReason; resetAt: string };

export type QuickCompLimitDeps = {
  /** The quick_comp_day bucket. False when the user is over today's cap. */
  consumeDaily: (userId: string) => Promise<boolean>;
  /** The shared 5/hour Trawl bucket the card page uses. */
  consumeHourly: (userId: string) => Promise<boolean>;
  now?: () => number;
};

/** When a window that started on a multiple of periodMs ends. */
export function windowResetAt(periodMs: number, now: number = Date.now()): string {
  return new Date((Math.floor(now / periodMs) + 1) * periodMs).toISOString();
}

/**
 * Spend one fresh lookup. Called only on a cache miss, right before Trawl.
 * The daily cap goes first, then the hourly Trawl cap still applies.
 */
export async function spendQuickCompLookup(
  userId: string,
  deps: QuickCompLimitDeps,
): Promise<QuickCompLimitResult> {
  const now = deps.now ?? Date.now;
  if (!(await deps.consumeDaily(userId))) {
    return { ok: false, reason: "daily", resetAt: windowResetAt(QUICK_COMP_DAY_MS, now()) };
  }
  if (!(await deps.consumeHourly(userId))) {
    return { ok: false, reason: "hourly", resetAt: windowResetAt(QUICK_COMP_HOUR_MS, now()) };
  }
  return { ok: true };
}
