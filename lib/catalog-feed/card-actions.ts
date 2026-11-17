"use server";

import { consumeLikeLimit, consumeRateLimit, LIKE_LIMIT_MESSAGE } from "@/lib/comps/rate-limit";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/value/card-value-access";
import {
  CARD_COMMENT_LIMIT_MESSAGE,
  CARD_COMMENTS_BUCKET,
  CARD_COMMENTS_LIMIT,
  CARD_COMMENTS_WINDOW_MS,
  cardSocialError,
  cleanCommentBody,
  SIGNED_OUT_COMMENT,
  SIGNED_OUT_LIKE,
  type CardCommentDeleteResult,
  type CardCommentResult,
  type CardLikeResult,
} from "./card-social";

/**
 * Card hearts and comments. Every write runs as the signed-in user, so the
 * tables' own rules decide (public cards only, blocks, own rows). The
 * hourly like limit and the comment limit are checked here first.
 */

/** Heart or unheart a card. The screen has already moved; this saves it. */
export async function syncCardLike(input: { cardId: string; liked: boolean }): Promise<CardLikeResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, error: SIGNED_OUT_LIKE };
  if (!isUuid(input.cardId)) return { ok: false, error: "That card could not be liked." };

  if (input.liked && !(await consumeLikeLimit(userId))) return { ok: false, error: LIKE_LIMIT_MESSAGE };

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Likes aren't available right now." };

  if (input.liked) {
    const { error } = await supabase.from("card_likes").insert({ card_id: input.cardId, user_id: userId });
    // 23505: already hearted. That is the state we want.
    if (error && error.code !== "23505") return { ok: false, error: cardSocialError(error, "Couldn't save that like.") };
  } else {
    const { error } = await supabase.from("card_likes").delete().eq("card_id", input.cardId).eq("user_id", userId);
    if (error) return { ok: false, error: cardSocialError(error, "Couldn't remove that like.") };
  }

  const { count, error } = await supabase
    .from("card_likes")
    .select("card_id", { count: "exact", head: true })
    .eq("card_id", input.cardId);
  return { ok: true, liked: input.liked, likeCount: error || count == null ? null : count };
}

/** Post a comment of 1 to 280 characters on a public card. */
export async function postCardComment(input: { cardId: string; body: string }): Promise<CardCommentResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, error: SIGNED_OUT_COMMENT };
  if (!isUuid(input.cardId)) return { ok: false, error: "That card can't take comments." };
  const clean = cleanCommentBody(input.body);
  if (!clean.ok) return clean;

  const allowed = await consumeRateLimit(userId, CARD_COMMENTS_BUCKET, CARD_COMMENTS_WINDOW_MS, CARD_COMMENTS_LIMIT);
  if (!allowed) return { ok: false, error: CARD_COMMENT_LIMIT_MESSAGE };

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Comments aren't available right now." };

  const { data, error } = await supabase
    .from("card_comments")
    .insert({ card_id: input.cardId, user_id: userId, body: clean.body })
    .select("id, card_id, user_id, body, created_at")
    .single();
  if (error || !data) return { ok: false, error: cardSocialError(error, "Couldn't post that comment.") };
  return {
    ok: true,
    comment: {
      id: String(data.id),
      cardId: String(data.card_id),
      userId: String(data.user_id),
      body: String(data.body),
      createdAt: String(data.created_at),
    },
  };
}

/** Delete a comment. The table lets its writer or the card's owner do it; anyone else deletes nothing. */
export async function deleteCardComment(input: { commentId: string }): Promise<CardCommentDeleteResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, error: SIGNED_OUT_COMMENT };
  if (!isUuid(input.commentId)) return { ok: false, error: "That comment could not be deleted." };

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Comments aren't available right now." };

  const { data, error } = await supabase.from("card_comments").delete().eq("id", input.commentId).select("id");
  if (error) return { ok: false, error: cardSocialError(error, "Couldn't delete that comment.") };
  if (!data || data.length === 0) return { ok: false, error: "You can't delete that comment." };
  return { ok: true };
}
