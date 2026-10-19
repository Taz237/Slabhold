import { loadSoldCompCard } from "@/lib/comps/load-card";
import {
  consumeRequestLimit,
  consumeTrawlLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/comps/rate-limit";
import { getAuthUserId } from "@/lib/supabase/server";
import { refreshCardValue } from "@/lib/value/getCardValue";

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

  const refreshed = await refreshCardValue(id, {
    beforeRequest: () => consumeRequestLimit(userId),
    beforeTrawl: () => consumeTrawlLimit(userId),
  });

  if (refreshed.attempt.reason === "budget_exhausted") {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  if (!refreshed.payload) {
    return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return Response.json(refreshed.payload);
}
