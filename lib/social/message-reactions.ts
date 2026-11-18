/**
 * DM reactions, Instagram style: double-tap for ❤️, long-press for the bar.
 * One reaction per person per message. The same emoji again removes it;
 * another emoji swaps it. Rows live in public.message_reactions.
 */

export const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Read to screen readers: "React with fire". */
export const REACTION_NAMES: Record<ReactionEmoji, string> = {
  "❤️": "heart",
  "👍": "thumbs up",
  "😂": "laughing",
  "😮": "surprised",
  "😢": "sad",
  "🔥": "fire",
};

/** Double-tap reacts with this. */
export const DOUBLE_TAP_EMOJI: ReactionEmoji = "❤️";

/** Two taps closer than this are a double tap. A single tap waits this long. */
export const DOUBLE_TAP_MS = 280;

/** Hold this long to open the emoji bar. */
export const LONG_PRESS_MS = 420;

/** A finger that moves farther than this is scrolling, not pressing. */
export const PRESS_SLOP_PX = 10;

export type MessageReaction = {
  messageId: string;
  userId: string;
  emoji: ReactionEmoji;
  createdAt: string;
};

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === "string" && (REACTION_EMOJIS as readonly string[]).includes(value);
}

/** What a pick does to your reaction: the same emoji clears it, another swaps it. */
export function nextReaction(current: ReactionEmoji | null, picked: ReactionEmoji): ReactionEmoji | null {
  return current === picked ? null : picked;
}

/** A message's reactions, oldest first. */
export function reactionsFor(list: readonly MessageReaction[], messageId: string): MessageReaction[] {
  return list
    .filter((item) => item.messageId === messageId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.userId.localeCompare(b.userId));
}

/** Set (or clear, with null) one person's reaction on one message. */
export function applyReaction(
  list: readonly MessageReaction[],
  change: { messageId: string; userId: string; emoji: ReactionEmoji | null; at: string },
): MessageReaction[] {
  const rest = list.filter((item) => !(item.messageId === change.messageId && item.userId === change.userId));
  if (!change.emoji) return rest;
  const existing = list.find((item) => item.messageId === change.messageId && item.userId === change.userId);
  // A swap keeps its place in the pill, as the database row keeps created_at.
  return [
    ...rest,
    { messageId: change.messageId, userId: change.userId, emoji: change.emoji, createdAt: existing?.createdAt ?? change.at },
  ];
}

export type ReactionPill = {
  /** Each emoji once, oldest first. */
  emojis: ReactionEmoji[];
  /** Shown only when both people reacted. */
  count: number | null;
  /** The viewer's own reaction, if any. */
  mine: ReactionEmoji | null;
};

/** The small pill under a bubble. Null when nobody reacted. */
export function reactionPill(reactions: readonly MessageReaction[], viewerId: string | null): ReactionPill | null {
  if (reactions.length === 0) return null;
  const sorted = [...reactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const emojis: ReactionEmoji[] = [];
  for (const item of sorted) if (!emojis.includes(item.emoji)) emojis.push(item.emoji);
  return {
    emojis,
    count: sorted.length > 1 ? sorted.length : null,
    mine: sorted.find((item) => item.userId === viewerId)?.emoji ?? null,
  };
}

export function mapReactionRow(row: Record<string, unknown>): MessageReaction | null {
  const { message_id: messageId, user_id: userId, emoji, created_at: createdAt } = row;
  if (typeof messageId !== "string" || typeof userId !== "string" || !isReactionEmoji(emoji)) return null;
  return { messageId, userId, emoji, createdAt: typeof createdAt === "string" ? createdAt : "" };
}

/**
 * One tap on a bubble. The first waits (a single tap toggles the time once
 * the wait is over); a second tap in time is a double tap.
 */
export function tapGesture(lastTapAt: number | null, now: number): { kind: "wait"; at: number } | { kind: "double" } {
  if (lastTapAt !== null && now - lastTapAt <= DOUBLE_TAP_MS) return { kind: "double" };
  return { kind: "wait", at: now };
}
