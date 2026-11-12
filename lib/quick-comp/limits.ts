/** Fresh Trawl lookups a user may start from Quick Comp per UTC day. */
export const QUICK_COMP_DAILY_LIMIT = 10;
/** Free-text bucket in comps_rate_limits. No migration needed. */
export const QUICK_COMP_DAY_BUCKET = "quick_comp_day";
/** 24h, so the window aligns to UTC midnight (7 PM ET in winter, 8 PM in summer). */
export const QUICK_COMP_DAY_MS = 24 * 60 * 60 * 1000;
/** Same as lib/comps/rate-limit TRAWL_WINDOW_MS (kept here to stay out of server-only). */
export const QUICK_COMP_HOUR_MS = 60 * 60 * 1000;

/**
 * Slabhold team badge holders (lib/social/team-badge.ts) skip the daily and
 * hourly caps so they can dial the scanner in. This is only a stuck-loop
 * guard on their new Trawl lookups, not a real limit.
 */
export const TEAM_DAILY_SAFETY_LIMIT = 200;
/** Free-text bucket in comps_rate_limits. No migration needed. */
export const QUICK_COMP_TEAM_DAY_BUCKET = "quick_comp_team_day";

/** safety: a team badge holder hit the 200 a day stuck-loop guard. */
export type QuickCompLimitReason = "daily" | "hourly" | "safety";

export type QuickCompLimitResult =
  | { ok: true }
  | { ok: false; reason: QuickCompLimitReason; resetAt: string };

export type QuickCompLimitDeps = {
  /** The quick_comp_day bucket. False when the user is over today's cap. */
  consumeDaily: (userId: string) => Promise<boolean>;
  /** The shared 5/hour Trawl bucket the card page uses. */
  consumeHourly: (userId: string) => Promise<boolean>;
  /**
   * True for a Slabhold team badge holder. A throw counts as false, so the
   * regular caps apply whenever we can't tell.
   */
  isUnlimited?: (userId: string) => Promise<boolean>;
  /** The team stuck-loop guard: TEAM_DAILY_SAFETY_LIMIT new lookups per UTC day. */
  consumeTeamSafety?: (userId: string) => Promise<boolean>;
  now?: () => number;
};

/** When a window that started on a multiple of periodMs ends. */
export function windowResetAt(periodMs: number, now: number = Date.now()): string {
  return new Date((Math.floor(now / periodMs) + 1) * periodMs).toISOString();
}

async function unlimited(userId: string, deps: QuickCompLimitDeps): Promise<boolean> {
  // Without the guard there's nothing to stop a stuck loop: the regular caps stay.
  if (!deps.isUnlimited || !deps.consumeTeamSafety) return false;
  try {
    return (await deps.isUnlimited(userId)) === true;
  } catch {
    return false;
  }
}

/**
 * Spend one fresh lookup. Called only on a cache miss, right before Trawl.
 * The daily cap goes first, then the hourly Trawl cap still applies. A team
 * badge holder spends neither, only the 200 a day stuck-loop guard.
 */
export async function spendQuickCompLookup(
  userId: string,
  deps: QuickCompLimitDeps,
): Promise<QuickCompLimitResult> {
  const now = deps.now ?? Date.now;
  if (await unlimited(userId, deps)) {
    if (!(await deps.consumeTeamSafety!(userId))) {
      return { ok: false, reason: "safety", resetAt: windowResetAt(QUICK_COMP_DAY_MS, now()) };
    }
    return { ok: true };
  }
  if (!(await deps.consumeDaily(userId))) {
    return { ok: false, reason: "daily", resetAt: windowResetAt(QUICK_COMP_DAY_MS, now()) };
  }
  if (!(await deps.consumeHourly(userId))) {
    return { ok: false, reason: "hourly", resetAt: windowResetAt(QUICK_COMP_HOUR_MS, now()) };
  }
  return { ok: true };
}
