import { getSoldComps } from "@/lib/comps";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import {
  consumeRequestLimit,
  consumeTrawlLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/comps/rate-limit";
import { getAuthUserId } from "@/lib/supabase/server";

export const UNAVAILABLE_MESSAGE =
  "Sold data unavailable, try again shortly";

export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "Log in to see sold comps" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const card = await loadSoldCompCard(id);
  if (!card) {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  const result = await getSoldComps(card, {
    beforeRequest: () => consumeRequestLimit(userId),
    beforeTrawl: () => consumeTrawlLimit(userId),
  });

  if (!result.ok) {
    if ("rateLimited" in result && result.rateLimited) {
      return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return Response.json(result.payload);
}
