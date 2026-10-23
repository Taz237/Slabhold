/** Stop and fail instead of returning a silently truncated read. */
export const LEADERBOARD_ROW_CAP = 20_000;

export const LEADERBOARD_PAGE_SIZE = 1000;

/**
 * A full page at the cap means more rows may exist. Throw so the board
 * shows an error instead of a partial ranking.
 */
export function pageExceededCap(
  table: string,
  loaded: number,
  batchLength: number,
  pageSize = LEADERBOARD_PAGE_SIZE,
  cap = LEADERBOARD_ROW_CAP,
): void {
  if (batchLength < pageSize) return;
  if (loaded >= cap) {
    throw new Error(`leaderboard read of ${table} hit the ${cap} row cap`);
  }
}
