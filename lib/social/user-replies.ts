import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAuthorSafety } from "@/lib/safety/filters";
import {
  COMMENT_COLUMNS_WITH_IMAGES,
  noteReplyImagesMissing,
  replyImageColumnMissing,
  replyImagesFromValue,
} from "./reply-images";
import type { PostComment } from "./types";

/** Newest replies a profile's Replies tab reads at once. */
export const USER_REPLIES_LIMIT = 100;

type Row = { id: string; post_id: string; user_id: string; body: string | null; created_at: string; image_urls?: unknown };

/**
 * One person's newest replies, for their profile's Replies tab, instead of
 * every reply on the site. Muted and blocked filtering as everywhere else.
 */
export async function loadUserReplies(
  supabase: SupabaseClient,
  input: { userId: string; viewerId: string | null; mutedHidden: readonly string[] },
): Promise<PostComment[]> {
  const run = async (columns: string) => {
    const query = supabase
      .from("comments")
      .select(columns)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(USER_REPLIES_LIMIT);
    return (await applyAuthorSafety(query, input.viewerId, input.mutedHidden, { mute: true })) as unknown as {
      data: Row[] | null;
      error: { code?: string; message?: string } | null;
    };
  };
  let result = await run(COMMENT_COLUMNS_WITH_IMAGES);
  if (result.error && replyImageColumnMissing(result.error)) {
    noteReplyImagesMissing();
    result = await run("id, post_id, user_id, body, created_at");
  }
  if (result.error) throw new Error(result.error.message ?? "Could not load replies.");
  return (result.data ?? []).map((row) => {
    const images = replyImagesFromValue(row.image_urls);
    return {
      id: row.id,
      postId: row.post_id,
      authorId: row.user_id,
      body: row.body ?? "",
      ...(images.length ? { images } : {}),
      createdAt: row.created_at,
    };
  });
}
