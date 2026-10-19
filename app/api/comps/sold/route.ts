import { loadSoldCompCard } from "@/lib/comps/load-card";
import {
  consumeRequestLimit,
  consumeTrawlLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/comps/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { soldCompsAccess } from "@/lib/value/card-value-access";
import { CardMarketUnavailable, loadCachedCardRefresh } from "@/lib/value/card-market";
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

  const access = await lookupSoldCompsAccess(id, userId);
  if (access === "unavailable") {
    return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (access === "hidden") {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  let refreshed;
  try {
    refreshed = await loadCachedCardRefresh(id, {
      save: access === "owner",
      beforeRequest: () => consumeRequestLimit(userId),
      beforeTrawl: () => consumeTrawlLimit(userId),
    });
  } catch (err) {
    const failed = err instanceof CardMarketUnavailable ? err.result : null;
    if (failed?.attempt.reason === "budget_exhausted") {
      return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    if (failed && !failed.payload) {
      return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    // A cache miss that threw for another reason still prices once, uncached.
    refreshed = await refreshCardValue(id, {
      save: access === "owner",
      beforeRequest: () => consumeRequestLimit(userId),
      beforeTrawl: () => consumeTrawlLimit(userId),
    });
  }

  if (refreshed.attempt.reason === "budget_exhausted") {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  if (!refreshed.payload) {
    return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return Response.json(refreshed.payload);
}

/** Public cards, plus the signed-in user's own row. Fail closed on lookup errors. */
async function lookupSoldCompsAccess(
  cardId: string,
  userId: string,
): Promise<"owner" | "public" | "hidden" | "unavailable"> {
  const admin = createSupabaseAdmin();
  if (!admin) return "unavailable";

  const [{ data: publicRow, error: publicError }, { data: ownedRow, error: ownedError }] =
    await Promise.all([
      admin.from("public_cards").select("id").eq("id", cardId).maybeSingle(),
      admin.from("cards").select("id").eq("id", cardId).eq("user_id", userId).maybeSingle(),
    ]);

  if (publicError || ownedError) {
    console.warn(
      "[comps/sold] visibility check failed:",
      publicError?.message ?? ownedError?.message,
    );
    return "unavailable";
  }

  return soldCompsAccess(
    cardId,
    new Set(publicRow ? [cardId] : []),
    new Set(ownedRow ? [cardId] : []),
  );
}
