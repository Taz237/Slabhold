import { LEADERBOARD_CACHE_SECONDS } from "./rules";

export function leaderboardCacheControl(): string {
  return `public, max-age=0, s-maxage=${LEADERBOARD_CACHE_SECONDS}, stale-while-revalidate=60`;
}
