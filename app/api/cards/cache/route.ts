import { revalidateTag } from "next/cache";
import { postCardCacheRefresh } from "@/lib/cards/card-cache-request";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { cardVisibilityTag } from "@/lib/value/card-cache";

export const runtime = "nodejs";

/** Pinged after the owner's public switch or delete saves. See lib/cards/card-cache-ping.ts. */
export async function POST(request: Request) {
  return postCardCacheRefresh(request, {
    getUserId: getAuthUserId,
    async cardOwner(cardId) {
      const supabase = await createSupabaseServer();
      if (!supabase) return null;
      const { data } = await supabase.from("cards").select("user_id").eq("id", cardId).maybeSingle();
      return typeof data?.user_id === "string" ? data.user_id : null;
    },
    revalidate(cardId) {
      revalidateTag(cardVisibilityTag(cardId), { expire: 0 });
    },
  });
}
