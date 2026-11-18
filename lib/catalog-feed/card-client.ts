import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { CARD_COMMENT_PAGE, type CardCommentDeleteResult, type CardCommentResult, type CardLikeResult } from "./card-social";

/** A comment as the sheet shows it. */
export type ListedCardComment = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  author: { username: string; displayName: string; avatarUrl: string | null } | null;
};

/**
 * How the feed reaches card hearts and comments. Reads run in the browser
 * under the viewer's own access (blocks apply). Writes go through the
 * server actions, which load on first use so the first paint doesn't carry
 * them. Tests swap these out.
 */
export const cardSocialClient = {
  like(input: { cardId: string; liked: boolean }): Promise<CardLikeResult> {
    return import("./card-actions").then(({ syncCardLike }) => syncCardLike(input));
  },
  post(input: { cardId: string; body: string }): Promise<CardCommentResult> {
    return import("./card-actions").then(({ postCardComment }) => postCardComment(input));
  },
  remove(input: { commentId: string }): Promise<CardCommentDeleteResult> {
    return import("./card-actions").then(({ deleteCardComment }) => deleteCardComment(input));
  },

  /** Which of these cards the viewer has hearted. */
  async likedCards(viewerId: string, cardIds: readonly string[]): Promise<Set<string>> {
    const supabase = await loadSupabaseBrowser();
    if (!supabase || cardIds.length === 0) return new Set();
    const { data, error } = await supabase
      .from("card_likes")
      .select("card_id")
      .eq("user_id", viewerId)
      .in("card_id", [...cardIds]);
    if (error) throw error;
    return new Set(((data ?? []) as { card_id: string }[]).map((row) => row.card_id));
  },

  /** A card's newest comments, newest first, with their writers. */
  async list(cardId: string): Promise<ListedCardComment[]> {
    const supabase = await loadSupabaseBrowser();
    if (!supabase) throw new Error("offline");
    const { data, error } = await supabase
      .from("card_comments")
      .select("id, user_id, body, created_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false })
      .limit(CARD_COMMENT_PAGE);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; body: string; created_at: string; user_id: string }[];
    const ids = [...new Set(rows.map((row) => row.user_id))];
    const { data: people } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
      : { data: [] };
    const byId = new Map(
      ((people ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null }[]).map((row) => [
        row.id,
        { username: row.username, displayName: row.display_name || row.username, avatarUrl: row.avatar_url },
      ]),
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      body: row.body,
      createdAt: row.created_at,
      author: byId.get(row.user_id) ?? null,
    }));
  },
};
