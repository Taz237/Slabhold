import { revalidateTag } from "next/cache";
import { postCardCacheRefresh } from "@/lib/cards/card-cache-request";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { cardVisibilityTag } from "@/lib/value/card-cache";

export const runtime = "nodejs";

/** Pinged after the owner's public switch or delete saves. See lib/cards/card-cache-ping.ts. */
export async function POST(request: Request) {
  return postCardCacheRefresh(request, {
    getUserId: getAuthUserId,
    async cardOwner(cardId) {
      // Admin read: the user's RLS client sees another user's private card as missing.
      const admin = createSupabaseAdmin();
      if (!admin) return { ok: false };
      const { data, error } = await admin.from("cards").select("user_id").eq("id", cardId).maybeSingle();
      if (error) return { ok: false };
      return { ok: true, ownerId: typeof data?.user_id === "string" ? data.user_id : null };
    },
    revalidate(cardId) {
      revalidateTag(cardVisibilityTag(cardId), { expire: 0 });
    },
  });
}
