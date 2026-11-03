export const REPORT_REASONS = [
  { id: "spam", label: "Spam" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate speech" },
  { id: "sexual", label: "Sexual content" },
  { id: "violence", label: "Violence or threats" },
  { id: "scam", label: "Scam or fraud" },
  { id: "misleading_listing", label: "Fake or misleading listing" },
  { id: "other", label: "Other" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export type ReportTargetType = "post" | "reply" | "user";

const REASON_IDS = new Set<string>(REPORT_REASONS.map((reason) => reason.id));

export type ReportInput = {
  reporterId: string;
  targetType: string;
  targetId: string;
  reportedUserId: string;
  reason: string;
  details?: string | null;
};

export type ReportInsert = {
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reported_user_id: string;
  reason: ReportReason;
  details: string | null;
};

/** Null when the report can be saved. */
export function validateReport(input: {
  reason: string;
  details?: string | null;
  targetType?: string;
  targetId?: string;
  reportedUserId?: string;
}): string | null {
  if (!REASON_IDS.has(input.reason)) return "Pick a reason.";
  if (input.details && input.details.length > 500) return "Keep details to 500 characters.";
  if (input.targetType && !["post", "reply", "user"].includes(input.targetType)) {
    return "That report target isn't supported.";
  }
  if (input.targetId !== undefined && !input.targetId.trim()) return "Missing report target.";
  if (input.reportedUserId !== undefined && !input.reportedUserId.trim()) {
    return "Missing reported account.";
  }
  return null;
}

export function reportInsert(input: ReportInput): ReportInsert | { error: string } {
  const problem = validateReport(input);
  if (problem) return { error: problem };
  const details = input.details?.trim() ?? "";
  return {
    reporter_id: input.reporterId,
    target_type: input.targetType as ReportTargetType,
    target_id: input.targetId.trim(),
    reported_user_id: input.reportedUserId.trim(),
    reason: input.reason as ReportReason,
    details: details ? details.slice(0, 500) : null,
  };
}

export type ReportWrite = {
  insert(row: ReportInsert): Promise<{ error?: string; code?: string }>;
};

/** A duplicate report is success and does not create a second row. */
export async function saveReport(
  db: ReportWrite,
  input: ReportInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = reportInsert(input);
  if ("error" in row) return { ok: false, error: row.error };
  const result = await db.insert(row);
  if (!result.error || result.code === "23505") return { ok: true };
  return { ok: false, error: result.error };
}

export const REPORT_DAILY_LIMIT = 20;
export const REPORT_LIMIT_MESSAGE = "You've sent a lot of reports today. Try again tomorrow";
export const REPORT_TARGET_GONE = "That post or reply is gone.";

/** Who wrote a post or reply, read on the server. Null when it's gone or hidden from the reader. */
export type AuthorLookup = (
  table: "posts" | "comments",
  id: string,
) => Promise<{ userId: string | null; error?: string }>;

/**
 * The account a report is about. Post and reply reports use the real author,
 * never the id the client sent. A user report is about its target.
 */
export async function reportedAccount(
  targetType: string,
  targetId: string,
  lookup: AuthorLookup,
): Promise<{ userId: string } | { error: string }> {
  const id = targetId.trim();
  if (targetType === "user") return id ? { userId: id } : { error: "Missing report target." };
  if (targetType !== "post" && targetType !== "reply") {
    return { error: "That report target isn't supported." };
  }
  const found = await lookup(targetType === "post" ? "posts" : "comments", id);
  if (found.error) return { error: found.error };
  return found.userId ? { userId: found.userId } : { error: REPORT_TARGET_GONE };
}

/** Counts the reporter's own reports since a time. A failed count reads as null. */
export type ReportCounter = (reporterId: string, sinceIso: string) => Promise<number | null>;

/**
 * True once the reporter has sent the daily limit in the last 24 hours. A
 * failed count lets the report through; the database cap is the hard stop.
 */
export async function reportCapReached(
  reporterId: string,
  count: ReportCounter,
  now = Date.now(),
): Promise<boolean> {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sent = await count(reporterId, since);
  return sent !== null && sent >= REPORT_DAILY_LIMIT;
}
