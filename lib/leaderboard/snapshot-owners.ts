import { upsertTodaysCollectionSnapshot } from "@/lib/collection/totals";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * After the morning price refresh, snapshot those cards' owners so a later
 * delete cannot keep yesterday's median. Failures stay off the refresh response.
 */
export async function snapshotOwnersAfterRefresh(cardIds: readonly string[]): Promise<void> {
  const ids = [...new Set(cardIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return;
  try {
    const admin = createSupabaseAdmin();
    if (!admin) return;
    const { data, error } = await admin.from("cards").select("user_id").in("id", ids);
    if (error) {
      console.error("[leaderboard] owner snapshot lookup failed", error.message);
      return;
    }
    const owners = new Set<string>();
    for (const row of data ?? []) {
      const userId = (row as { user_id?: unknown }).user_id;
      if (typeof userId === "string" && userId.length > 0) owners.add(userId);
    }
    for (const userId of owners) {
      try {
        await upsertTodaysCollectionSnapshot(userId);
      } catch (caught) {
        console.error(
          "[leaderboard] owner snapshot failed",
          caught instanceof Error ? caught.message : "error",
        );
      }
    }
  } catch (caught) {
    console.error(
      "[leaderboard] owner snapshot failed",
      caught instanceof Error ? caught.message : "error",
    );
  }
}
