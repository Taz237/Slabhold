import { timeAgo } from "@/lib/format";
import { isVouchRating, percentPositive, VOUCH_COPY, vouchCountLabel, type VouchRating, type VouchSummary } from "./rules";

/** Small pieces the vouches page draws with. No React here, so each is easy to check. */

export type VouchFilter = VouchRating | "all";
export const VOUCH_FILTERS: readonly VouchFilter[] = ["all", "positive", "neutral", "negative"];

/** ?rating= from the address bar. Anything that isn't a rating is All. */
export function filterFromParam(value: string | null | undefined): VouchFilter {
  return isVouchRating(value) ? value : "all";
}

/** The page's address for a filter: ?rating=negative, or no query for All. */
export function filterHref(path: string, filter: VouchFilter): string {
  return filter === "all" ? path : `${path}?rating=${filter}`;
}

/** A vouch's place on the page: the admin "View target" link and vouch notices open here. */
export function vouchAnchorId(vouchId: string): string {
  return `vouch-${vouchId}`;
}

/** The vouch id in "#vouch-<id>", or null. */
export function vouchIdFromHash(hash: string | null | undefined): string | null {
  const found = /^#?vouch-([A-Za-z0-9-]{1,64})$/.exec(hash ?? "");
  return found ? found[1]! : null;
}

/** How many vouches each tab holds. These are everyone's counts: the list a reader gets can be shorter. */
export function filterCount(summary: VouchSummary | null, filter: VouchFilter): number | null {
  if (!summary) return null;
  return filter === "all" ? summary.total : summary[filter];
}

/** The breakdown bar: each rating's share of the whole, in percent. Empty when there are no vouches. */
export function breakdownShares(summary: Pick<VouchSummary, "positive" | "neutral" | "negative">): { rating: VouchRating; percent: number }[] {
  const total = summary.positive + summary.neutral + summary.negative;
  if (total <= 0) return [];
  return (["positive", "neutral", "negative"] as const)
    .filter((rating) => summary[rating] > 0)
    .map((rating) => ({ rating, percent: (summary[rating] * 100) / total }));
}

/** "100% positive", once enough vouches are rated. Null before that. */
export function percentLabel(summary: Pick<VouchSummary, "positive" | "negative">): string | null {
  const percent = percentPositive(summary);
  return percent === null ? null : `${percent}% positive`;
}

/** "Last vouch 3d ago", "Last vouch just now", "Last vouch yesterday", "Last vouch Oct 3". Empty when there is none. */
export function lastVouchLabel(iso: string | null | undefined, now = new Date()): string {
  const when = timeAgo(iso, now);
  if (!when) return "";
  if (/^\d+[a-z]+$/i.test(when)) return VOUCH_COPY.lastVouch(`${when} ago`);
  // "Just now" and "Yesterday" sit mid-sentence here. A date ("Oct 3") keeps its capital.
  return VOUCH_COPY.lastVouch(/^(just now|yesterday)$/i.test(when) ? when.toLowerCase() : when);
}

/** "8 vouches · joined Oct 2026" under a voucher's name. A voucher with none of their own just shows when they joined. */
export function voucherMeta(vouchTotal: number, createdAt: string | null | undefined): string {
  return [vouchTotal > 0 ? vouchCountLabel(vouchTotal) : "", joinedLabel(createdAt)].filter(Boolean).join(" · ");
}

/** "joined Oct 2026", for the line under a voucher's name. Empty when the date is unknown. */
export function joinedLabel(iso: string | null | undefined): string {
  const then = iso ? new Date(iso) : null;
  if (!then || Number.isNaN(then.getTime())) return "";
  return VOUCH_COPY.joined(then.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }));
}
