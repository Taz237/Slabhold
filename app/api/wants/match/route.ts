import { consumeWantMatchLimit } from "@/lib/comps/rate-limit";
import { getAuthUserId } from "@/lib/supabase/server";
import { notifyOwnedCard, notifyOwnedListing, notifyOwnedPost } from "@/lib/wants/dispatch";
import { postWantMatch } from "@/lib/wants/match-request";

export const runtime = "nodejs";

/**
 * Match a post, card, or listing the signed-in user just saved.
 * Sale alerts are created from the comps refresh, not this route.
 */
export async function POST(request: Request) {
  return postWantMatch(request, {
    getUserId: getAuthUserId,
    consumeLimit: consumeWantMatchLimit,
    notify(userId, sourceType, sourceId) {
      if (sourceType !== "card") {
        return sourceType === "post"
          ? notifyOwnedPost(userId, sourceId)
          : notifyOwnedListing(userId, sourceId);
      }
      return notifyOwnedCard(userId, sourceId);
    },
  });
}
