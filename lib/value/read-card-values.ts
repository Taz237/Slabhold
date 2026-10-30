import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { loadCachedCardValue } from "./card-market";
import { visibleCardIds } from "./card-value-access";
import { getCardValues } from "./getCardValue";
import { attachPriceContext } from "./price-context";
import type { CardValueResult } from "./types";

/**
 * Trusted values for ids already filtered by lookupAllowedIds (card_values
 * only, never Trawl). One id reads its own row; more read in one batch.
 * Shared by /api/card-values and the Collection page's server render.
 */
export async function readCardValues(
  allowedIds: string[],
  userId: string | null,
): Promise<Record<string, CardValueResult>> {
  if (allowedIds.length === 1) {
    const only = allowedIds[0];
    const loaded = await loadCachedCardValue(only);
    const map = new Map<string, CardValueResult>();
    if (loaded) map.set(only, loaded);
    const enriched = await attachPriceContext([only], map, userId);
    const value = enriched.get(only);
    return value ? { [only]: value } : {};
  }

  const loaded = allowedIds.length ? await getCardValues(allowedIds) : new Map();
  const map = await attachPriceContext(allowedIds, loaded, userId);
  const values: Record<string, CardValueResult> = {};
  for (const [id, value] of map) {
    values[id] = value;
  }
  return values;
}

/** Public cards, plus the signed-in user's own rows. Fail closed on lookup errors. */
export async function lookupAllowedIds(
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
