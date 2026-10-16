import {
  consumeRequestLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/comps/rate-limit";
import { getAuthUserId } from "@/lib/supabase/server";
import { getCardValue, getCardValues } from "@/lib/value/getCardValue";
import type { CardValueResult } from "@/lib/value/types";

export const runtime = "nodejs";

/**
 * Read trusted card values (card_values only — never Trawl).
 * GET ?id=  or  GET ?ids=a,b,c
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await consumeRequestLimit(userId);
  if (!allowed) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const single = searchParams.get("id")?.trim() ?? "";
  const many = searchParams.get("ids")?.trim() ?? "";

  if (single) {
    const value = await getCardValue(single);
    return Response.json({ id: single, value });
  }

  if (!many) {
    return Response.json({ error: "id or ids is required" }, { status: 400 });
  }

  const ids = many
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 500);

  const map = await getCardValues(ids);
  const values: Record<string, CardValueResult> = {};
  for (const [id, value] of map) {
    values[id] = value;
  }

  return Response.json({ values });
}
