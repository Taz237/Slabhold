import "server-only";

import { hasTeamBadge } from "@/lib/social/team-badge";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/** The username lookup, swappable in tests. */
export type UsernameLookup = (userId: string) => Promise<string | null>;

async function profileUsername(userId: string): Promise<string | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const username = (data as { username?: unknown } | null)?.username;
  return typeof username === "string" ? username : null;
}

/**
 * True when this user's username is on the Slabhold team badge list
 * (TEAM_BADGE_USERNAMES). A failed lookup or no username is false: the
 * regular caps apply.
 */
export function makeTeamCheck(lookup: UsernameLookup = profileUsername) {
  return async function isTeamBadgeHolder(userId: string): Promise<boolean> {
    try {
      return hasTeamBadge(await lookup(userId));
    } catch {
      return false;
    }
  };
}
