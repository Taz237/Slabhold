import { groupHeadline } from "@/lib/social/group-notifications";
import type { NotificationKind } from "@/lib/social/types";
import type { SourceKind } from "./prefs";

/** Events for one recipient and group key inside this window collapse into one trailing push. */
export const BATCH_WINDOW_MS = 60_000;

/**
 * The Web Notification tag, so a newer push replaces the older one on the
 * device instead of stacking. Mirrors private.push_group_key in the migration.
 */
export function pushGroupKey(kind: SourceKind, postId: string | null, actorId: string | null): string {
  if (kind === "follow") return "follow";
  if (kind === "dm") return `dm:${actorId ?? "none"}`;
  const prefix = kind === "comment" ? "reply" : kind;
  return `${prefix}:${postId ?? "none"}`;
}

export type GroupMember = { actorId: string | null; createdAt: string; valid: boolean };

/** Distinct actors still valid now (not unliked, unfollowed, blocked or deleted), newest first. */
export function distinctValidActors(rows: readonly GroupMember[]): string[] {
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of sorted) {
    if (!row.valid || !row.actorId || seen.has(row.actorId)) continue;
    seen.add(row.actorId);
    ids.push(row.actorId);
  }
  return ids;
}

/** "Jordan Hale and 4 others liked your post": the in-app verbs, for `count` distinct people. */
export function summaryLine(kind: Exclude<SourceKind, "dm">, names: readonly string[], count: number): string {
  const people = Math.max(count, names.length, 1);
  const padded = Array.from({ length: people }, (_, index) => names[index] ?? "Someone");
  return groupHeadline(kind as NotificationKind, padded);
}

export function dmSummaryLine(count: number, name: string): string {
  const who = name.trim() || "a collector";
  return count === 1 ? `1 new message from ${who}` : `${count} new messages from ${who}`;
}

/**
 * The first event in a window sends at once. Later ones collapse until the
 * window closes, and so does anything over the recipient's rate limit or
 * racing another sender for the same group.
 */
export function batchDecision(input: {
  now: number;
  lastPushAt: number | null;
  leaseTaken: boolean;
  rateAllows: boolean;
}): "send" | "collapse" {
  if (!input.leaseTaken) return "collapse";
  if (input.lastPushAt !== null && input.now - input.lastPushAt < BATCH_WINDOW_MS) return "collapse";
  if (!input.rateAllows) return "collapse";
  return "send";
}

/** When a collapsed group may send its trailing summary. */
export function tailDueAt(lastPushAt: number | null, now: number): number {
  return lastPushAt === null ? now : lastPushAt + BATCH_WINDOW_MS;
}
