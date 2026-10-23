"use server";

import { runOncePerUser } from "./snapshot-limit";

/** Write today's medians before a delete, sale, or identity edit. A failure does not block the edit. */
export async function snapshotOwnedCollection(): Promise<void> {
  try {
    const { getAuthUserId } = await import("@/lib/supabase/server");
    const userId = await getAuthUserId();
    if (!userId) return;
    await runOncePerUser(userId, async () => {
      const { upsertTodaysCollectionSnapshot } = await import("@/lib/collection/totals");
      await upsertTodaysCollectionSnapshot(userId);
    });
  } catch (error) {
    console.error(
      "[leaderboard] snapshot before change failed",
      error instanceof Error ? error.message : "error",
    );
  }
}
