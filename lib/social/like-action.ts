"use server";

import { consumeLikeLimit, LIKE_LIMIT_MESSAGE } from "@/lib/comps/rate-limit";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { isUuid } from "@/lib/value/card-value-access";
import { missingLikesRelation, readLikeCount } from "./likes";

export type SyncLikeResult =
  | { ok: true; likeCount: number | null; liked: boolean; fallback?: boolean }
  | { ok: false; error: string };

function blockedByPolicy(message: string | undefined): boolean {
  return /row-level security|violates row-level/i.test(message ?? "");
}

function likeLimited(message: string | undefined): boolean {
  return /liking posts too quickly/i.test(message ?? "");
}

/** Write one like or unlike after the hourly bucket. The screen updates first. */
export async function syncPostLike(input: {
  postId: string;
  liked: boolean;
}): Promise<SyncLikeResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, error: "Log in to like posts." };
  if (!isUuid(input.postId)) return { ok: false, error: "That post could not be liked." };

  if (input.liked) {
    const allowed = await consumeLikeLimit(userId);
    if (!allowed) return { ok: false, error: LIKE_LIMIT_MESSAGE };
  }

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Likes aren't available right now." };

  if (input.liked) {
    const { error } = await supabase.from("likes").insert({
      post_id: input.postId,
      user_id: userId,
    });
    if (error && error.code !== "23505") {
      if (missingLikesRelation(error)) {
        return { ok: true, likeCount: null, liked: true, fallback: true };
      }
      if (likeLimited(error.message)) return { ok: false, error: LIKE_LIMIT_MESSAGE };
      if (blockedByPolicy(error.message)) return { ok: false, error: BLOCKED_INTERACTION };
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", userId);
    if (error) {
      if (missingLikesRelation(error)) {
        return { ok: true, likeCount: null, liked: false, fallback: true };
      }
      if (likeLimited(error.message)) return { ok: false, error: LIKE_LIMIT_MESSAGE };
      return { ok: false, error: error.message };
    }
  }

  const { data, error } = await supabase
    .from("posts")
    .select("like_count")
    .eq("id", input.postId)
    .maybeSingle();
  if (error || !data) return { ok: true, likeCount: null, liked: input.liked };
  return { ok: true, likeCount: readLikeCount(data.like_count) ?? null, liked: input.liked };
}
