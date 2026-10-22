import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Profile id of the official updates account. The handle can change;
 * signup resolves this id and does not look up a username.
 * Override with OFFICIAL_UPDATES_USER_ID. An empty or invalid value is a no-op.
 * The env uuid and the SQL uuid in private.follow_official_updates must stay in sync.
 * See supabase/migrations/20261022210000_follow_official_updates.sql.
 */
export const OFFICIAL_UPDATES_USER_ID = "6d31ab97-9162-4296-876d-9e0378872fce";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Undefined uses the default id. Blank or non-uuid values follow nobody. */
export function officialUpdatesUserId(raw?: string | null): string | null {
  const value = (raw == null ? OFFICIAL_UPDATES_USER_ID : raw).trim();
  if (!value || !UUID.test(value)) return null;
  return value.toLowerCase();
}

/** True only for the updates profile id. A matching handle is not enough. */
export function isOfficialUpdatesAccount(id: string | null | undefined): boolean {
  const officialId = officialUpdatesUserId();
  if (!officialId || !id) return false;
  return id.trim().toLowerCase() === officialId;
}

export function officialUpdatesFollow(
  userId: string,
  officialId: string | null,
): { follower_id: string; following_id: string } | null {
  const followerId = userId.trim();
  if (!officialId || !followerId) return null;
  if (followerId.toLowerCase() === officialId.toLowerCase()) return null;
  return { follower_id: followerId, following_id: officialId };
}

/**
 * Insert one follow from a brand-new account to the updates account.
 * Duplicate inserts are ignored. Failures are ignored so signup still succeeds.
 * This does not write a follow notification.
 */
export async function followOfficialUpdates(
  supabase: SupabaseClient,
  userId: string,
  rawOfficialId: string | null | undefined = process.env.OFFICIAL_UPDATES_USER_ID,
): Promise<void> {
  const edge = officialUpdatesFollow(userId, officialUpdatesUserId(rawOfficialId));
  if (!edge) return;
  try {
    await supabase.from("follows").upsert(edge, {
      onConflict: "follower_id,following_id",
      ignoreDuplicates: true,
    });
  } catch {
    // The account is already created. A missed auto-follow must not undo that.
  }
}
