"use server";

import { revalidateTag } from "next/cache";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { VALUE_BOARD_CACHE_TAG } from "./cache";
import { saveLeaderboardOptIn, type LeaderboardOptInDb } from "./opt-in";
import { allowValueBoardRevalidate } from "./revalidate-limit";

/** Save the opt-in flag for the signed-in user, then drop the shared board cache. */
export async function setLeaderboardOptIn(
  optedIn: boolean,
): Promise<{ optedIn: boolean; error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { optedIn: false, error: "You need to be signed in." };
  const supabase = await createSupabaseServer();
  if (!supabase) return { optedIn: false, error: "Couldn't save that setting." };
  const result = await saveLeaderboardOptIn(
    supabase as unknown as LeaderboardOptInDb,
    userId,
    optedIn === true,
  );
  if (!result.error && allowValueBoardRevalidate(userId)) {
    revalidateTag(VALUE_BOARD_CACHE_TAG, { expire: 0 });
  }
  return result;
}
