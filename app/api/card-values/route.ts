import {
  consumeAnonymousCardValueLimit,
  consumeCardValueLimit,
} from "@/lib/comps/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  parseCardValueIds,
  visibleCardIds,
} from "@/lib/value/card-value-access";
import { loadCachedCardValue } from "@/lib/value/card-market";
import { getCardValues } from "@/lib/value/getCardValue";
import { attachPriceContext } from "@/lib/value/price-context";
import { PRICE_CHECK_LIMIT_MESSAGE } from "@/lib/value/price-check-limit";
import type { CardValueResult } from "@/lib/value/types";

export const runtime = "nodejs";
export const maxDuration = 15;

function priceCheckLimited(): Response {
  return Response.json(
    { error: PRICE_CHECK_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

/**
 * Read trusted card values (card_values only — never Trawl).
 * GET ?id=  or  GET ?ids=a,b,c
 *
 * Logged out: only ids present in public_cards.
 * Signed in: those public ids, plus cards the caller owns.
 * Other ids are omitted. More than 100 ids is rejected.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (userId) {
    const allowed = await consumeCardValueLimit(userId);
    if (!allowed) return priceCheckLimited();
  } else {
    const allowed = await consumeAnonymousCardValueLimit(request);
    if (!allowed) return priceCheckLimited();
  }

  const { searchParams } = new URL(request.url);
  const single = searchParams.get("id")?.trim() ?? "";
  const many = searchParams.get("ids")?.trim() ?? "";
  const parts = single ? [single] : many.split(",");
  const parsed = parseCardValueIds(parts);

  if (!parsed.ok) {
    if (parsed.error === "too_many") {
      return Response.json({ error: "At most 100 ids" }, { status: 400 });
    }
    return Response.json({ error: "id or ids is required" }, { status: 400 });
  }

  const allowedIds = await lookupAllowedIds(parsed.ids, userId);

  if (single) {
    if (!allowedIds.includes(single)) {
      return Response.json({ id: single, value: null });
    }
    const loaded = await loadCachedCardValue(single);
    const map = new Map<string, CardValueResult>();
    if (loaded) map.set(single, loaded);
    const enriched = await attachPriceContext([single], map, userId);
    return Response.json({ id: single, value: enriched.get(single) ?? null });
  }

  if (allowedIds.length === 1) {
    const only = allowedIds[0];
    const loaded = await loadCachedCardValue(only);
    const map = new Map<string, CardValueResult>();
    if (loaded) map.set(only, loaded);
    const enriched = await attachPriceContext([only], map, userId);
    const value = enriched.get(only);
    return Response.json({ values: value ? { [only]: value } : {} });
  }

  const loaded = allowedIds.length ? await getCardValues(allowedIds) : new Map();
  const map = await attachPriceContext(allowedIds, loaded, userId);
  const values: Record<string, CardValueResult> = {};
  for (const [id, value] of map) {
    values[id] = value;
  }

  return Response.json({ values });
}

/** Public cards, plus the signed-in user's own rows. Fail closed on lookup errors. */
async function lookupAllowedIds(
  ids: string[],
  userId: string | null,
): Promise<string[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data: publicRows, error: publicError } = await admin
    .from("public_cards")
    .select("id")
    .in("id", ids);

  if (publicError) {
    console.warn("[card_values] public filter failed:", publicError.message);
    return [];
  }

  const publicIds = new Set(
    (publicRows ?? []).map((row) => String((row as { id: string }).id)),
  );
  const ownedIds = new Set<string>();

  if (userId) {
    const { data: ownedRows, error: ownedError } = await admin
      .from("cards")
      .select("id")
      .in("id", ids)
      .eq("user_id", userId);
    if (ownedError) {
      console.warn("[card_values] owner filter failed:", ownedError.message);
    } else {
      for (const row of ownedRows ?? []) {
        ownedIds.add(String((row as { id: string }).id));
      }
    }
  }

  return visibleCardIds(ids, publicIds, ownedIds);
}
