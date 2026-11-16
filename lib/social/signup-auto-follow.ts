import type { SupabaseClient } from "@supabase/supabase-js";
import { BRAND_ACCOUNT_IDS } from "@/lib/leaderboard/brand-accounts";

/**
 * Profile id every new account follows on signup: the main @slabhold account.
 * Matched by id, never by handle, so a rename does not break it.
 * Must stay in sync with slabhold_id in private.follow_slabhold_on_signup.
 * See supabase/migrations/20261116140000_signup_follow_slabhold.sql.
 */
export const SIGNUP_AUTO_FOLLOW_USER_ID: string = BRAND_ACCOUNT_IDS[0];

/**
 * Insert one follow from a brand-new account to @slabhold.
 * Duplicates are ignored. Failures are ignored so signup still succeeds.
 * Does not write a follow notification. Call only on account creation.
 */
export async function followSlabholdOnSignup(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const followerId = userId.trim();
  const target = SIGNUP_AUTO_FOLLOW_USER_ID.toLowerCase();
  if (!followerId || followerId.toLowerCase() === target) return;
  try {
    await supabase.from("follows").upsert(
      { follower_id: followerId, following_id: target },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true },
    );
  } catch {
    // The account is already created. A missed auto-follow must not undo that.
  }
}
