/**
 * When the iPhone app may show Apple's "Rate Slabhold" popup. Pure: no
 * Capacitor, no storage. lib/ios/review.ts reads the inputs and records the ask.
 * Apple still decides whether it shows, and caps it at 3 a year.
 */
export type ReviewMoment = "third-card" | "first-quick-comp";

/** App sessions so far, counted once per launch in startNativeShell. */
export const LAUNCHES_KEY = "slabhold.native.launches";
/** Session guard so a reload doesn't count as another launch. */
export const LAUNCH_COUNTED_KEY = "slabhold.native.launch-counted";
/** JSON list of app versions we already asked in. */
export const ASKED_VERSIONS_KEY = "slabhold.review.asked";
/** JSON list of moments that already asked, so each one asks once ever. */
export const ASKED_MOMENTS_KEY = "slabhold.review.moments";

export type ReviewInput = {
  moment: ReviewMoment;
  /** Null when storage is blocked. */
  launches: number | null;
  /** Null when storage is blocked. */
  askedVersions: readonly string[] | null;
  /** Null when storage is blocked. */
  askedMoments: readonly string[] | null;
  /** The App Store version, from App.getInfo(). Null when unknown. */
  version: string | null;
};

export function shouldAskForReview({ moment, launches, askedVersions, askedMoments, version }: ReviewInput): boolean {
  if (launches == null || askedVersions == null || askedMoments == null || !version) return false;
  // Never on the first launch.
  if (!Number.isFinite(launches) || launches < 2) return false;
  // At most once per app version.
  if (askedVersions.includes(version)) return false;
  // Each moment only once ever.
  if (askedMoments.includes(moment)) return false;
  return true;
}

/** A stored JSON list of strings. Anything else reads as empty. */
export function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** The stored launch count. Missing or junk is 0. */
export function parseLaunches(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The list with this item added once, ready to store. */
export function withItem(list: readonly string[], item: string): string {
  return JSON.stringify(list.includes(item) ? [...list] : [...list, item]);
}

type KeyValue = Pick<Storage, "getItem" | "setItem">;

/**
 * Counts this app session once: a sessionStorage guard plus a localStorage
 * counter. Returns the count, or null when storage is blocked.
 */
export function countLaunch(local: KeyValue, session: KeyValue): number | null {
  try {
    const launches = parseLaunches(local.getItem(LAUNCHES_KEY));
    if (session.getItem(LAUNCH_COUNTED_KEY) === "1") return launches;
    session.setItem(LAUNCH_COUNTED_KEY, "1");
    local.setItem(LAUNCHES_KEY, String(launches + 1));
    return launches + 1;
  } catch {
    return null;
  }
}

/**
 * Reads the rules' inputs, and when they say yes, records the version and the
 * moment before anything is shown. True means "ask now". Storage blocked → false.
 */
export function claimReviewAsk(local: KeyValue, moment: ReviewMoment, version: string | null): boolean {
  try {
    const launches = parseLaunches(local.getItem(LAUNCHES_KEY));
    const askedVersions = parseList(local.getItem(ASKED_VERSIONS_KEY));
    const askedMoments = parseList(local.getItem(ASKED_MOMENTS_KEY));
    if (!shouldAskForReview({ moment, launches, askedVersions, askedMoments, version })) return false;
    local.setItem(ASKED_VERSIONS_KEY, withItem(askedVersions, version as string));
    local.setItem(ASKED_MOMENTS_KEY, withItem(askedMoments, moment));
    return true;
  } catch {
    return false;
  }
}
