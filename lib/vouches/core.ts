/**
 * The small part of the vouch rules a trust line needs: the counts, the percent and the line itself.
 * Kept apart from ./rules (all the copy and the note checks) so a profile only loads this.
 * ./rules re-exports everything here.
 */

/** The percent shows once this many vouches are positive or negative. */
export const PERCENT_MIN_RATED = 3;
/** Most profiles in one vouch_summaries call. */
export const SUMMARY_MAX_IDS = 50;
export const NO_VOUCHES = "No vouches yet";
export const VOUCH_FAILED = "Couldn't save that. Try again.";
export const VOUCH_BUSY = "Saving…";

export const VOUCH_RATINGS = ["positive", "neutral", "negative"] as const;
export type VouchRating = (typeof VOUCH_RATINGS)[number];

export function isVouchRating(value: unknown): value is VouchRating {
  return typeof value === "string" && (VOUCH_RATINGS as readonly string[]).includes(value);
}

/**
 * The counts behind a trust line. They cover everyone's vouches, so they can be higher than the
 * number of rows a reader gets from the list: the list leaves out people in a block with the reader.
 * Never check one against the other.
 */
export type VouchSummary = {
  userId: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  lastVouchAt: string | null;
  /** Vouchers the reader follows. Zero when signed out. */
  followedCount: number;
  followedSampleUsername: string | null;
};

export function emptySummary(userId: string): VouchSummary {
  return { userId, total: 0, positive: 0, neutral: 0, negative: 0, lastVouchAt: null, followedCount: 0, followedSampleUsername: null };
}

/**
 * Percent positive = positive / (positive + negative). Neutral doesn't count against anyone.
 * Rounded down, so 99.6% never shows as 100%. Null until enough vouches are rated.
 */
export function percentPositive(summary: Pick<VouchSummary, "positive" | "negative">): number | null {
  const rated = summary.positive + summary.negative;
  if (rated < PERCENT_MIN_RATED) return null;
  return Math.floor((summary.positive * 100) / rated);
}

export const wholeCount = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
export const vouchCount = (total: number) => `${total.toLocaleString("en-US")} ${total === 1 ? "vouch" : "vouches"}`;

/** "✓ 14 vouches · 100% positive", "✓ 1 vouch", "No vouches yet". */
export function trustLine(summary: Pick<VouchSummary, "total" | "positive" | "negative"> | null | undefined): string {
  const total = wholeCount(summary?.total ?? 0);
  if (!summary || total === 0) return NO_VOUCHES;
  const percent = percentPositive(summary);
  return percent === null ? `✓ ${vouchCount(total)}` : `✓ ${vouchCount(total)} · ${percent}% positive`;
}

