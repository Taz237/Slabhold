"use server";

/** Write today's medians before a delete, sale, or identity edit. A failure does not block the edit. */
export async function snapshotOwnedCollection(): Promise<void> {
  try {
    const [{ upsertTodaysCollectionSnapshot }, { getAuthUserId }] = await Promise.all([
      import("@/lib/collection/totals"),
      import("@/lib/supabase/server"),
    ]);
    const userId = await getAuthUserId();
    if (!userId) return;
    await upsertTodaysCollectionSnapshot(userId);
  } catch (error) {
    console.error(
      "[leaderboard] snapshot before change failed",
      error instanceof Error ? error.message : "error",
    );
  }
}
