import { fetchInviteCode } from "@/lib/invites/code";
import { postStoryResponse } from "@/lib/share/post-story-response";
import { createAnonReader } from "@/lib/supabase/anon";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 1080×1920 post image for Instagram and TikTok Stories. Hidden, deleted,
 * blocked or unknown posts are a 404, never a picture.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await createSupabaseServer();
  return postStoryResponse(id, createAnonReader(), {
    // The viewer's own session, so a block between the two hides the post (same read as the post page).
    canSee: async (postId) => {
      if (!session) return null;
      const { data, error } = await session.from("posts").select("id").eq("id", postId).maybeSingle();
      return !error && Boolean(data?.id);
    },
    id: getAuthUserId,
    inviteCode: () => fetchInviteCode(session),
  });
}
