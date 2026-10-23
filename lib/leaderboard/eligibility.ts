import { isTestAccount } from "@/lib/test-accounts";

export const LEADERBOARD_MIN_CARDS_DEFAULT = 5;
export const LEADERBOARD_MIN_VALUE_DEFAULT = 100;
export const LEADERBOARD_MIN_COLLECTORS = 10;

export const LEADERBOARD_CLOSED_COPY = "Leaderboard opens when 10 collectors join, opt in";

export const LEADERBOARD_NOTE =
  "Based on recent sold prices; values update as new sales come in.";

export type LeaderboardMinimums = {
  minCards: number;
  minValue: number;
};

function raised(raw: string | undefined, floor: number): number {
  if (raw == null || raw.trim() === "") return floor;
  const value = Number(raw);
  if (!Number.isFinite(value)) return floor;
  return value > floor ? value : floor;
}

/**
 * Defaults are 5 valued cards and $100.
 * LEADERBOARD_MIN_CARDS and LEADERBOARD_MIN_VALUE can raise those floors.
 * A lower env value stays at the floor, matching the SQL function.
 */
export function leaderboardMinimums(
  env: { LEADERBOARD_MIN_CARDS?: string; LEADERBOARD_MIN_VALUE?: string } = {
    LEADERBOARD_MIN_CARDS: process.env.LEADERBOARD_MIN_CARDS,
    LEADERBOARD_MIN_VALUE: process.env.LEADERBOARD_MIN_VALUE,
  },
): LeaderboardMinimums {
  const cards = raised(env.LEADERBOARD_MIN_CARDS, LEADERBOARD_MIN_CARDS_DEFAULT);
  return {
    minCards: Math.floor(cards),
    minValue: raised(env.LEADERBOARD_MIN_VALUE, LEADERBOARD_MIN_VALUE_DEFAULT),
  };
}

export function isLeaderboardTestAccount(username: string, isTest = false): boolean {
  if (isTest) return true;
  return isTestAccount(username);
}

export function isLeaderboardEligible(input: {
  optedIn: boolean;
  publicCollection: boolean;
  valuedCards: number;
  value: number;
  username: string;
  isTest?: boolean;
  minCards?: number;
  minValue?: number;
}): boolean {
  const minCards = input.minCards ?? LEADERBOARD_MIN_CARDS_DEFAULT;
  const minValue = input.minValue ?? LEADERBOARD_MIN_VALUE_DEFAULT;
  if (!input.optedIn) return false;
  if (!input.publicCollection) return false;
  if (isLeaderboardTestAccount(input.username, input.isTest === true)) return false;
  if (input.valuedCards < minCards) return false;
  if (!(input.value >= minValue)) return false;
  return true;
}

/** The tab opens only when this many collections qualify for that comparison. */
export function leaderboardOpens(
  qualifying: number,
  minimum = LEADERBOARD_MIN_COLLECTORS,
): boolean {
  return qualifying >= minimum;
}
