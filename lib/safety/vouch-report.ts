import { REPORT_VOUCH_GONE, reportedAccount, type AuthorLookup, type ReportTargetType } from "./report";

/**
 * Reports on a vouch or on a reply to one. Kept out of ./report so the report sheet, which every
 * post carries, doesn't load any of it.
 */

export const REPORT_TARGET_TYPES: readonly ReportTargetType[] = ["post", "reply", "user", "vouch", "vouch_reply"];

/** The report sheet's title for each kind of target. */
export function reportTitle(targetType: ReportTargetType): string {
  if (targetType === "user") return "Report user";
  if (targetType === "vouch") return "Report vouch";
  if (targetType === "reply" || targetType === "vouch_reply") return "Report reply";
  return "Report post";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who a vouch is from and about, read with the service role. Null when it's gone. */
export type VouchLookup = (
  id: string,
) => Promise<{ voucherId: string; subjectId: string; hasReply: boolean } | null | { error: string }>;

/**
 * The account a report is about, vouches included. Posts, replies and users are exactly
 * reportedAccount.
 *
 * A vouch is about its voucher, and a reply to one about the person who wrote the reply.
 * Readers can't read the vouches table, so:
 *   - with `vouches.lookup` (the service role, for moderators) the real row decides;
 *   - without it (a reader sending a report) `vouches.claimed` is passed through only to fill
 *     the column. The database trigger private.set_report_target overwrites it with the real
 *     account, and refuses a vouch that doesn't exist. The client is never trusted for it.
 */
export async function reportedAccountFor(
  targetType: string,
  targetId: string,
  lookup: AuthorLookup,
  vouches: { lookup?: VouchLookup; claimed?: string | null } = {},
): Promise<{ userId: string } | { error: string }> {
  if (targetType !== "vouch" && targetType !== "vouch_reply") return reportedAccount(targetType, targetId, lookup);
  const id = targetId.trim();
  if (!UUID.test(id)) return { error: REPORT_VOUCH_GONE };
  if (!vouches.lookup) {
    const claimed = vouches.claimed?.trim() ?? "";
    return UUID.test(claimed) ? { userId: claimed } : { error: "Missing reported account." };
  }
  const found = await vouches.lookup(id);
  if (found && "error" in found) return { error: found.error };
  if (!found || (targetType === "vouch_reply" && !found.hasReply)) return { error: REPORT_VOUCH_GONE };
  return { userId: targetType === "vouch" ? found.voucherId : found.subjectId };
}
