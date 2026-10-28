import { rankBoard, type LeaderboardWeekSlice } from "@/lib/leaderboard/present";
import { LEADERBOARD_MIN_ENTRIES } from "@/lib/leaderboard/rules";
import { weekContaining } from "@/lib/leaderboard/week";

export type PodiumFinish = {
  /** Monday of the week, YYYY-MM-DD in ET. */
  weekStart: string;
  boardId: string;
  userId: string;
  rank: number;
};

/** Top 3 on each board of a closed week. One row per user per board, best rank. */
export function podiumFinishes(slice: LeaderboardWeekSlice, now: Date): PodiumFinish[] {
  if (now.getTime() < Date.parse(slice.finalAt)) return [];
  const weekStart = weekContaining(new Date(slice.start)).startDate;
  const finishes: PodiumFinish[] = [];
  for (const [boardId, board] of Object.entries(slice.boards)) {
    if (!board) continue;
    const seen = new Set<string>();
    for (const entry of rankBoard(board.rows, [], null, "").entries) {
      if (entry.rank > LEADERBOARD_MIN_ENTRIES) break;
      if (seen.has(entry.userId)) continue;
      seen.add(entry.userId);
      finishes.push({ weekStart, boardId, userId: entry.userId, rank: entry.rank });
    }
  }
  return finishes;
}
