import { after } from "next/server";
import { consumeTrawlLimit } from "@/lib/comps/rate-limit";
import { refreshCardValue } from "@/lib/value/getCardValue";
import { getAuthUserId } from "@/lib/supabase/server";

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

  after(async () => {
    try {
      await refreshCardValue(id, {
        beforeTrawl: () => consumeTrawlLimit(userId),
      });
    } catch (err) {
      console.warn(
        "[card_values] background refresh failed:",
        err instanceof Error ? err.message : err,
      );
    }
  });

  return Response.json({ ok: true, scheduled: true, id });
}
