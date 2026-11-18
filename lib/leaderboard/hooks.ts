import type { RankMove, YouRow } from "./present";
import { LEADERBOARD_PATH, leaderboardTab, scoreUnit } from "./rules";

/** The viewer's spot in two parts: the big rank, and the one line that says what is next. */
export type SpotHook = {
  /** "#3", or "" when the viewer is not on the board. */
  rank: string;
  line: string;
};

/**
 * What the viewer's spot says. Every number is the board's own:
 * - #2 to #10 this week: what it takes to pass the place ahead, "3 cards to pass @flaherty".
 *   One more than the gap, because a tie does not pass anyone.
 * - #1 with a runner-up: the lead, "3 cards ahead of @flaherty".
 * - Below the top 10: the presenter's own top-10 line.
 * - Last week: "You finished #3", and nothing to chase.
 */
export function spotHook(you: YouRow, scoreLabel: string, week: "current" | "previous"): SpotHook {
  if (you.rank <= 0) return { rank: "", line: "Not ranked yet" };
  const rank = `#${you.rank}`;
  if (week === "previous") return { rank, line: `You finished ${rank}` };
  const rival = you.rival;
  if (!rival) return { rank, line: you.rank === 1 ? "Top spot" : you.gap };
  if (you.rank === 1) {
    if (rival.tied) return { rank, line: `Tied with ${rival.handle}` };
    return { rank, line: `${rival.need} ${scoreUnit(scoreLabel, rival.need)} ahead of ${rival.handle}` };
  }
  const toPass = rival.need + 1;
  return { rank, line: `${toPass} ${scoreUnit(scoreLabel, toPass)} to pass ${rival.handle}` };
}

/** "Up 2 from last week", for screen readers next to the arrow. */
export function moveLabel(move: RankMove): string {
  if (move.direction === "same") return "Same place as last week";
  return `${move.direction === "up" ? "Up" : "Down"} ${move.places} from last week`;
}

const ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/** "1st", "2nd", "3rd", then "4th" and up. */
export function ordinal(rank: number): string {
  if (ORDINAL[rank]) return ORDINAL[rank];
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return `${rank}th`;
  return `${rank}${["th", "st", "nd", "rd"][rank % 10] ?? "th"}`;
}

/** The viewer's own rank image for one board and week. Signed-in owner only. */
export function rankSharePath(boardId: string, week: "current" | "previous"): string {
  const params = new URLSearchParams({ board: boardId });
  if (week === "previous") params.set("week", "last");
  return `/api/share-image/leaderboard-rank?${params.toString()}`;
}

/** The link a shared rank opens: this board, this week. Always names the board. */
export function rankShareLink(boardId: string, week: "current" | "previous"): string {
  const params = new URLSearchParams();
  if (week === "previous") params.set("week", "last");
  params.set("board", boardId);
  return `${LEADERBOARD_PATH}?${params.toString()}`;
}

/** "#3 on Most cards added this week on Slabhold". Real rank and board only. */
export function rankShareText(rank: number, boardId: string, week: "current" | "previous"): string {
  const label = leaderboardTab(boardId)?.label ?? "the leaderboard";
  return `#${rank} on ${label} ${week === "previous" ? "last week" : "this week"} on Slabhold`;
}
