import "server-only";

import { consumeRateLimit, consumeTrawlLimit } from "@/lib/comps/rate-limit";
import { makeTeamCheck, type UsernameLookup } from "@/lib/social/team-check-server";
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

export { makeTeamCheck, type UsernameLookup };

export const serverQuickCompLimits: QuickCompLimitDeps = {
  consumeDaily: consumeQuickCompDayLimit,
  consumeHourly: consumeTrawlLimit,
  isUnlimited: makeTeamCheck(),
  consumeTeamSafety: consumeTeamSafetyLimit,
};
