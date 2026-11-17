import { QUICK_COMP_DAY_MS, QUICK_COMP_HOUR_MS, TEAM_DAILY_SAFETY_LIMIT, type QuickCompLimitDeps, type QuickCompLimitReason } from "./limits";

/**
 * Player search's own caps, apart from Quick Comp's, so browsing players never
 * uses up a comp. Spent only on a 6-hour cache miss, right before Trawl.
 * Free-text buckets in comps_rate_limits: no migration needed.
 */
export const PLAYER_SEARCH_DAILY_LIMIT = 5;
export const PLAYER_SEARCH_HOURLY_LIMIT = 3;
export const PLAYER_SEARCH_DAY_BUCKET = "quick_comp_player_day";
export const PLAYER_SEARCH_HOUR_BUCKET = "quick_comp_player_hour";
/** A team badge holder's stuck-loop guard for player search, apart from Quick Comp's. */
export const PLAYER_SEARCH_TEAM_DAY_BUCKET = "quick_comp_player_team_day";

export const PLAYER_DAILY_MESSAGE = `You've looked up ${PLAYER_SEARCH_DAILY_LIMIT} players today`;
export const PLAYER_HOURLY_MESSAGE = "You're looking up players quickly. Try again in a few minutes";
export const PLAYER_SAFETY_MESSAGE = "You've hit today's safety limit on player lookups";
/** Under every player cap note: the comp side is untouched. */
export const PLAYER_LIMIT_CAPTION = "Quick Comp still works";

export function playerLimitMessage(reason: QuickCompLimitReason): string {
  if (reason === "daily") return PLAYER_DAILY_MESSAGE;
  if (reason === "safety") return PLAYER_SAFETY_MESSAGE;
  return PLAYER_HOURLY_MESSAGE;
}

type Consume = (userId: string, bucket: string, windowMs: number, limit: number) => Promise<boolean>;

/**
 * Player search's caps on the rate-limit table: its own day, hour and team buckets.
 * Never Quick Comp's day bucket or the shared Trawl hour bucket.
 */
export function makePlayerSearchLimits(consume: Consume, isUnlimited?: (userId: string) => Promise<boolean>): QuickCompLimitDeps {
  return {
    consumeDaily: (userId) => consume(userId, PLAYER_SEARCH_DAY_BUCKET, QUICK_COMP_DAY_MS, PLAYER_SEARCH_DAILY_LIMIT),
    consumeHourly: (userId) => consume(userId, PLAYER_SEARCH_HOUR_BUCKET, QUICK_COMP_HOUR_MS, PLAYER_SEARCH_HOURLY_LIMIT),
    isUnlimited,
    consumeTeamSafety: (userId) => consume(userId, PLAYER_SEARCH_TEAM_DAY_BUCKET, QUICK_COMP_DAY_MS, TEAM_DAILY_SAFETY_LIMIT),
  };
}
