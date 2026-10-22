import { revalidateTag } from "next/cache";
import { compsResultCacheTag } from "@/lib/comps/comps-result-cache";
import {
  consumeRequestLimit,
  consumeTrawlLimit,
} from "@/lib/comps/rate-limit";
import { lookupSoldCompsAccess } from "@/lib/comps/sold-access";
import {
  respondSoldComps,
  shouldBustCompsResult,
  SOLD_UNAVAILABLE_MESSAGE,
} from "@/lib/comps/sold-response";
import { getAuthUserId } from "@/lib/supabase/server";
import { loadCachedCardRefresh } from "@/lib/value/card-market";

/** Bust the comps-result cache after a live write. Never fails the response. */
function bustCompsResult(cardId: string): void {
  try {
    revalidateTag(compsResultCacheTag(cardId), { expire: 0 });
  } catch (err) {
    console.warn(
      "[comps] cache bust failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

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
    loadRefresh: async (cardId, options) => {
      const refreshed = await loadCachedCardRefresh(cardId, options);
      if (shouldBustCompsResult(refreshed.refreshedLive, refreshed.payload)) {
        bustCompsResult(cardId);
      }
      return refreshed;
    },
    beforeRequest: () => consumeRequestLimit(userId),
    beforeTrawl: () => consumeTrawlLimit(userId),
  });
}
