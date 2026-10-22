import {
  consumeRequestLimit,
  consumeTrawlLimit,
} from "@/lib/comps/rate-limit";
import { lookupSoldCompsAccess } from "@/lib/comps/sold-access";
import {
  respondSoldComps,
  SOLD_UNAVAILABLE_MESSAGE,
} from "@/lib/comps/sold-response";
import { getAuthUserId } from "@/lib/supabase/server";
import { loadCachedCardRefresh } from "@/lib/value/card-market";

export const UNAVAILABLE_MESSAGE = SOLD_UNAVAILABLE_MESSAGE;

export const maxDuration = 15;

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

  return respondSoldComps(id, userId, {
    lookupAccess: lookupSoldCompsAccess,
    loadRefresh: loadCachedCardRefresh,
    beforeRequest: () => consumeRequestLimit(userId),
    beforeTrawl: () => consumeTrawlLimit(userId),
  });
}
