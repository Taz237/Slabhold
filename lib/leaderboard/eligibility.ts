import { isTestAccount } from "@/lib/test-accounts";

export const LEADERBOARD_MIN_CARDS_DEFAULT = 10;
export const LEADERBOARD_MIN_VALUE_DEFAULT = 250;
export const LEADERBOARD_MIN_ACCOUNT_DAYS_DEFAULT = 7;
export const LEADERBOARD_MIN_COLLECTORS = 10;

export const LEADERBOARD_CLOSED_COPY = "Leaderboard opens when 10 collectors join, opt in";

export const LEADERBOARD_NOTE =
  "Based on recent sold prices; values update as new sales come in.";

export type LeaderboardMinimums = {
  minCards: number;
  minValue: number;
  minAccountDays: number;
};

function raised(raw: string | undefined, floor: number): number {
  if (raw == null || raw.trim() === "") return floor;
  const value = Number(raw);
  if (!Number.isFinite(value)) return floor;
  return value > floor ? value : floor;
}

/**
 * Defaults are 10 trusted valued cards, $250, and an account 7 days old.
 * LEADERBOARD_MIN_CARDS, LEADERBOARD_MIN_VALUE, and LEADERBOARD_MIN_ACCOUNT_DAYS
 * can raise those floors. A lower env value stays at the floor, matching SQL.
 */
export function leaderboardMinimums(
  env: {
    LEADERBOARD_MIN_CARDS?: string;
    LEADERBOARD_MIN_VALUE?: string;
    LEADERBOARD_MIN_ACCOUNT_DAYS?: string;
  } = {
    LEADERBOARD_MIN_CARDS: process.env.LEADERBOARD_MIN_CARDS,
    LEADERBOARD_MIN_VALUE: process.env.LEADERBOARD_MIN_VALUE,
    LEADERBOARD_MIN_ACCOUNT_DAYS: process.env.LEADERBOARD_MIN_ACCOUNT_DAYS,
  },
): LeaderboardMinimums {
  const cards = raised(env.LEADERBOARD_MIN_CARDS, LEADERBOARD_MIN_CARDS_DEFAULT);
  const days = raised(env.LEADERBOARD_MIN_ACCOUNT_DAYS, LEADERBOARD_MIN_ACCOUNT_DAYS_DEFAULT);
  return {
    minCards: Math.floor(cards),
    minValue: raised(env.LEADERBOARD_MIN_VALUE, LEADERBOARD_MIN_VALUE_DEFAULT),
    minAccountDays: Math.floor(days),
  };
}

export function isLeaderboardTestAccount(username: string, isTest = false): boolean {
  if (isTest) return true;
  return isTestAccount(username);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the account is at least `minDays` old at `now`. */
export function accountOldEnough(
  createdAt: string | null | undefined,
  now: Date,
  minDays: number,
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return now.getTime() - created.getTime() >= minDays * DAY_MS;
}

export function isLeaderboardEligible(input: {
  optedIn: boolean;
  publicCollection: boolean;
  valuedCards: number;
  value: number;
  username: string;
  accountCreatedAt?: string | null;
  now?: Date;
  isTest?: boolean;
  minCards?: number;
  minValue?: number;
  minAccountDays?: number;
}): boolean {
  const minCards = input.minCards ?? LEADERBOARD_MIN_CARDS_DEFAULT;
  const minValue = input.minValue ?? LEADERBOARD_MIN_VALUE_DEFAULT;
  const minAccountDays = input.minAccountDays ?? LEADERBOARD_MIN_ACCOUNT_DAYS_DEFAULT;
  const now = input.now ?? new Date();
  if (!input.optedIn) return false;
  if (!input.publicCollection) return false;
  if (isLeaderboardTestAccount(input.username, input.isTest === true)) return false;
  if (input.valuedCards < minCards) return false;
  if (!(input.value >= minValue)) return false;
  if (!accountOldEnough(input.accountCreatedAt, now, minAccountDays)) return false;
  return true;
}

/** A bracket opens only when this many collections qualify for it. */
export function leaderboardOpens(
  qualifying: number,
  minimum = LEADERBOARD_MIN_COLLECTORS,
): boolean {
  return qualifying >= minimum;
}
