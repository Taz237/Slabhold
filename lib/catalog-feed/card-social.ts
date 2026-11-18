/**
 * Hearts and comments on cards (public.card_likes, public.card_comments).
 * Pure helpers shared by the server actions, the feed and the comments sheet.
 */

export const CARD_COMMENT_MAX = 280;
/** Newest comments the sheet reads at once. */
export const CARD_COMMENT_PAGE = 50;

/** Comments per signed-in user per window, checked in the server action. */
export const CARD_COMMENTS_BUCKET = "card-comments";
export const CARD_COMMENTS_LIMIT = 20;
export const CARD_COMMENTS_WINDOW_MS = 10 * 60 * 1000;

/**
 * Card hearts per signed-in user per hour. Their own bucket: a busy night of
 * hearting cards never uses up the timeline's post likes, or the other way.
 */
export const CARD_LIKES_BUCKET = "card-likes";
export const CARD_LIKES_LIMIT = 300;
export const CARD_LIKES_WINDOW_MS = 60 * 60 * 1000;
export const CARD_LIKE_LIMIT_MESSAGE = "You're liking cards too quickly. Please wait a bit and try again.";

export const SIGNED_OUT_LIKE = "Log in to like cards.";
export const SIGNED_OUT_COMMENT = "Log in to comment.";
export const COMMENT_REJECTED = "That comment can't be posted.";
export const ACCOUNT_RESTRICTED = "Your account can't do that right now.";
export const CARD_COMMENT_LIMIT_MESSAGE = "You're commenting too quickly. Please wait a bit and try again.";
export const COMMENT_EMPTY = "Write a comment.";
export const COMMENT_TOO_LONG = `Comments are ${CARD_COMMENT_MAX} characters or fewer.`;
export const BLOCKED_CARD = "You can't interact with this card.";

export type CardLikeResult =
  | { ok: true; liked: boolean; likeCount: number | null }
  | { ok: false; error: string };

export type CardComment = {
  id: string;
  cardId: string;
  userId: string;
  body: string;
  createdAt: string;
};

export type CardCommentResult = { ok: true; comment: CardComment } | { ok: false; error: string };
export type CardCommentDeleteResult = { ok: true } | { ok: false; error: string };

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * A database error as words for the reader. 23514 is a check that failed
 * (the comment rules), 42501 is a restricted account or a write RLS refused.
 * Raw database text never reaches the screen.
 */
export function cardSocialError(error: DbError, fallback: string): string {
  if (!error) return fallback;
  const message = error.message ?? "";
  if (error.code === "23514") return COMMENT_REJECTED;
  if (/row-level security|violates row-level/i.test(message)) return BLOCKED_CARD;
  if (error.code === "42501") return ACCOUNT_RESTRICTED;
  if (/too quickly/i.test(message)) return message;
  return fallback;
}

/** The comment as it will be saved, or why it can't be. Trims, counts characters, not bytes. */
export function cleanCommentBody(value: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  if (!body) return { ok: false, error: COMMENT_EMPTY };
  if ([...body].length > CARD_COMMENT_MAX) return { ok: false, error: COMMENT_TOO_LONG };
  return { ok: true, body };
}

/** Characters left, counted the way the server counts them. */
export function commentCharsLeft(value: string): number {
  return CARD_COMMENT_MAX - [...value.trim()].length;
}

/** Who may delete a comment: its writer, or the card's owner. */
export function canDeleteCardComment(input: {
  viewerId: string | null | undefined;
  commentUserId: string;
  cardOwnerId: string;
}): boolean {
  if (!input.viewerId) return false;
  return input.viewerId === input.commentUserId || input.viewerId === input.cardOwnerId;
}
