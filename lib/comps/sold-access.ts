import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { soldCompsAccess } from "@/lib/value/card-value-access";

/**
 * Minimal owner/visibility check for /api/comps/sold.
 * Selects only id rows — no comps, cache, value, or Trawl work.
 */
export async function lookupSoldCompsAccess(
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
