import "server-only";

import { consumeRateLimit, consumeTrawlLimit } from "@/lib/comps/rate-limit";
import { hasTeamBadge } from "@/lib/social/team-badge";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  QUICK_COMP_DAILY_LIMIT,
  QUICK_COMP_DAY_BUCKET,
  QUICK_COMP_DAY_MS,
  QUICK_COMP_TEAM_DAY_BUCKET,
  TEAM_DAILY_SAFETY_LIMIT,
  type QuickCompLimitDeps,
} from "./limits";

/** One Quick Comp lookup against today's cap. Fails closed after a lost write. */
export function consumeQuickCompDayLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(userId, QUICK_COMP_DAY_BUCKET, QUICK_COMP_DAY_MS, QUICK_COMP_DAILY_LIMIT);
}

/** A team badge holder's stuck-loop guard. Fails closed after a lost write. */
export function consumeTeamSafetyLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(userId, QUICK_COMP_TEAM_DAY_BUCKET, QUICK_COMP_DAY_MS, TEAM_DAILY_SAFETY_LIMIT);
}

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

export const serverQuickCompLimits: QuickCompLimitDeps = {
  consumeDaily: consumeQuickCompDayLimit,
  consumeHourly: consumeTrawlLimit,
  isUnlimited: makeTeamCheck(),
  consumeTeamSafety: consumeTeamSafetyLimit,
};
