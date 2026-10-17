import { isCardOwner } from "@/lib/comps/ownership";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Flag a sold comp as not a match.
 * Only the card owner (cards.user_id === session user) may write.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { cardId?: string; itemId?: string } = {};
  try {
    body = (await request.json()) as { cardId?: string; itemId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cardId = body.cardId?.trim() ?? "";
  const itemId = body.itemId?.trim() ?? "";
  if (!cardId || !itemId) {
    return Response.json({ error: "cardId and itemId are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }

  const { data: card, error } = await admin
    .from("cards")
    .select("user_id")
    .eq("id", cardId)
    .maybeSingle();

  if (error) {
    console.warn("[comp_flags] ownership check failed:", error.message);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
  if (!card || !isCardOwner(card.user_id as string, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: writeError } = await admin.from("comp_flags").upsert(
    {
      user_id: userId,
      card_id: cardId,
      item_id: itemId,
    },
    { onConflict: "user_id,card_id,item_id" },
  );
  if (writeError) {
    console.warn("[comp_flags] upsert failed:", writeError.message);
    return Response.json({ error: "Could not save flag" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
