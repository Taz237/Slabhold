import { stripUnsupportedOgText } from "@/lib/og/safe-text";
import { formatWeekLabel } from "./dates";
import type { LeaderboardShareLine, LeaderboardShareModel } from "./share";

export const ESTIMATED_FROM_SOLD = "Est. from recent sold prices";

export function rankShareText(input: { username: string; percent: number }): string {
  const handle = input.username.trim().replace(/^@+/, "");
  if (input.percent >= 1) return `@${handle} up 100% or more this week on Slabhold`;
  const magnitude = Math.abs(input.percent * 100).toFixed(1);
  const direction = input.percent < 0 ? "down" : "up";
  return `@${handle} ${direction} ${magnitude}% this week on Slabhold`;
}

type ShareBracket = {
  open: boolean;
  rows: readonly { username: string; rank: number; percentLabel: string }[];
};

function shareName(username: string): string {
  const handle = stripUnsupportedOgText(username.trim().replace(/^@+/, "")).replace(/\s+/g, "");
  return handle ? `@${handle.slice(0, 40)}` : "Collector";
}

/**
 * Value-board preview, drawn by renderLeaderboardOg. Percents only: no
 * collection totals and no team marks. Closed brackets stay off it, so a thin
 * board has no lines.
 */
export function valueBoardShareModel(board: {
  start: string;
  end: string;
  brackets: readonly ShareBracket[];
}): LeaderboardShareModel {
  const lines: LeaderboardShareLine[] = board.brackets
    .filter((bracket) => bracket.open)
    .flatMap((bracket) => bracket.rows)
    .slice(0, 3)
    .map((row) => ({
      place: `#${row.rank}`,
      name: shareName(row.username),
      detail: stripUnsupportedOgText(row.percentLabel),
    }));
  const week = board.start && board.end ? stripUnsupportedOgText(formatWeekLabel(board.start, board.end)) : "";
  return {
    title: "Value leaderboard",
    kicker: week || "This week",
    detail: ESTIMATED_FROM_SOLD,
    lines,
  };
}
