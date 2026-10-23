"use server";

import { flushValueBoardCache } from "./flush-cache";
import { saveLeaderboardOptIn, type LeaderboardOptInDb } from "./opt-in";
import { allowValueBoardRevalidate, shouldFlushAfterOptIn } from "./revalidate-limit";

/** Save the opt-in flag for the signed-in user, then drop the shared board cache. */
export async function setLeaderboardOptIn(
  optedIn: boolean,
): Promise<{ optedIn: boolean; error?: string }> {
  const { createSupabaseServer, getAuthUserId } = await import("@/lib/supabase/server");
  const userId = await getAuthUserId();
  if (!userId) return { optedIn: false, error: "You need to be signed in." };
  const supabase = await createSupabaseServer();
  if (!supabase) return { optedIn: false, error: "Couldn't save that setting." };
  const result = await saveLeaderboardOptIn(
    supabase as unknown as LeaderboardOptInDb,
    userId,
    optedIn === true,
  );
  if (!result.error && shouldFlushAfterOptIn(optedIn === true, userId)) {
    await flushValueBoardCache();
  }
  return result;
}

/**
 * Username, avatar, and test-handle changes show on the board.
 * Signed-in only, and rate-limited, so this is not a public cache flush.
 */
export async function revalidateValueBoardForAccount(): Promise<void> {
  const { getAuthUserId } = await import("@/lib/supabase/server");
  const userId = await getAuthUserId();
  if (!userId || !allowValueBoardRevalidate(userId)) return;
  await flushValueBoardCache();
}
