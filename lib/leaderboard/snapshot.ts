import type { LeaderboardSnapshot } from "./present";
import { buildWeekBoards, type ScoreInput } from "./score";
import { previousWeek, weekContaining } from "./week";

export function snapshotFromInput(input: ScoreInput, now: Date): LeaderboardSnapshot {
  const current = weekContaining(now);
  const previous = previousWeek(now);
  const slice = (week: typeof current) => ({
    start: week.start.toISOString(),
    end: week.end.toISOString(),
    finalAt: week.finalAt.toISOString(),
    label: week.label,
    boards: buildWeekBoards(input, week),
  });
  return {
    generatedAt: now.toISOString(),
    current: slice(current),
    previous: slice(previous),
  };
}

export function emptySnapshot(now: Date): LeaderboardSnapshot {
  return snapshotFromInput(
    { profiles: [], posts: [], cards: [], usersWithPost: [], likes: [], replies: [], follows: [] },
    now,
  );
}
