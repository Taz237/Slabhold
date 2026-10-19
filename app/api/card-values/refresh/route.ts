import { after } from "next/server";
import {
  consumeRequestLimit,
  consumeTrawlLimit,
} from "@/lib/comps/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { revalidateCard } from "@/lib/value/card-market";
import { refreshCardValue } from "@/lib/value/getCardValue";

export const runtime = "nodejs";

/**
 * Schedule a background refreshCardValue. Never blocks on Trawl.
 * Called after card create / detail changes.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string } = {};
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim() ?? "";
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const client = createSupabaseAdmin();
  if (!client) {
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }

  const { data: owned, error } = await client
    .from("cards")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[card_values] ownership check failed:", error.message);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
  if (!owned) {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  after(async () => {
    try {
      await refreshCardValue(id, {
        beforeRequest: () => consumeRequestLimit(userId),
        beforeTrawl: () => consumeTrawlLimit(userId),
      });
    } catch (err) {
      console.warn(
        "[card_values] background refresh failed:",
        err instanceof Error ? err.message : err,
      );
    }
    revalidateCard(id);
  });

  return Response.json({ ok: true, scheduled: true, id });
}
