import { LEADERBOARD_CACHE_SECONDS } from "./rules";

export function leaderboardCacheControl(): string {
  return `public, max-age=0, s-maxage=${LEADERBOARD_CACHE_SECONDS}, stale-while-revalidate=60`;
}

/** Shared tag for the public value board. Opt-in changes expire it immediately. */
export const VALUE_BOARD_CACHE_TAG = "value-board";
