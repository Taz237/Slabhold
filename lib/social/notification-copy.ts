import { isReactionEmoji } from "./message-reactions";
import type { NotificationKind } from "./types";

/**
 * What a notification row says. Kept apart from ./group-notifications, which every page loads
 * for the bell's count: only the notifications screen and push need the wording.
 */

/** What each kind says after the name. A kind not listed here is a follow. */
const ACTIONS: Partial<Record<NotificationKind, string>> = {
  like: "liked your post",
  comment: "commented on your post",
  repost: "reposted your post",
  quote: "quoted your post",
  mention: "mentioned you",
  want_alert: "matched a card you want",
  deal_confirm: "asked you to confirm a deal",
  poll_ended: "Your poll ended. See the final results",
  vouch: "vouched for you",
  vouch_reply: "replied to your vouch",
};

export function notificationAction(kind: NotificationKind, metadata?: Record<string, unknown> | null): string {
  if (kind === "dm_reaction") {
    const emoji = metadata?.emoji;
    return isReactionEmoji(emoji) ? `reacted ${emoji} to your message` : "reacted to your message";
  }
  return ACTIONS[kind] ?? "followed you";
}

export function groupHeadlineParts(
  kind: NotificationKind,
  names: string[],
  metadata?: Record<string, unknown> | null,
): { lead: string; rest: string } {
  const action = notificationAction(kind, metadata);
  const lead = names[0]?.trim() || "Someone";
  if (names.length <= 1) return { lead, rest: ` ${action}` };
  if (names.length === 2) {
    const second = names[1]?.trim() || "Someone";
    return { lead, rest: ` and ${second} ${action}` };
  }
  return { lead, rest: ` and ${names.length - 1} others ${action}` };
}

export function groupHeadline(
  kind: NotificationKind,
  names: string[],
  metadata?: Record<string, unknown> | null,
): string {
  const parts = groupHeadlineParts(kind, names, metadata);
  return `${parts.lead}${parts.rest}`;
}
