import { stripUnsupportedOgText } from "@/lib/og/safe-text";
import type { LeaderboardSnapshot } from "./present";
import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";
import { isBrandAccount } from "./brand-accounts";
import {
  LAST_WEEK_LABEL,
  LEADERBOARD_TABS,
  LEADERBOARD_TITLE,
  THIN_BOARD_TITLE,
  THIS_WEEK_LABEL,
  leaderboardTab,
} from "./rules";
import { rankBoard } from "./present";

export type LeaderboardShareLine = {
  place: string;
  name: string;
  detail: string;
};

export type LeaderboardShareModel = {
  title: string;
  kicker: string;
  detail: string;
  lines: LeaderboardShareLine[];
};

const NAME_LIMIT = 48;

function safe(value: string, fallback: string): string {
  const cleaned = stripUnsupportedOgText(value).slice(0, NAME_LIMIT);
  return cleaned || fallback;
}

/** Text-only share card. No team marks, no card photos. */
export function leaderboardShareModel(snapshot: LeaderboardSnapshot): LeaderboardShareModel {
  const tab = LEADERBOARD_TABS[0];
  const ranked = rankBoard(snapshot.current.boards[tab.id]?.rows ?? [], [], null, tab.scoreLabel);
  const lines: LeaderboardShareLine[] = ranked.thin
    ? []
    : ranked.entries.slice(0, 3).map((entry) => ({
        place: `#${entry.rank}`,
        name: safe(entry.title, "Collector"),
        detail: safe(`${entry.score} ${entry.scoreLabel}`, ""),
      }));
  return {
    title: safe(LEADERBOARD_TITLE, "Leaderboard"),
    kicker: safe(snapshot.current.label, "This week"),
    detail: lines.length > 0 ? safe(tab.label, "Top card post") : safe(THIN_BOARD_TITLE, "Leaderboard"),
    lines,
  };
}

/** The viewer's own place on one board, for their share image. */
export type RankShareModel = {
  rank: number;
  /** Podium metal for places 1 to 3. Null from #4 down. */
  metal: "gold" | "silver" | "bronze" | null;
  name: string;
  /** "@handle", or "" when the row has none. */
  handle: string;
  board: string;
  /** "This week" or "Last week". */
  weekTag: string;
  /** The week's real bounds, as the page shows them. */
  weekLabel: string;
  /** "22 cards": the row's own score and unit. */
  score: string;
};

const METALS = ["gold", "silver", "bronze"] as const;

/**
 * The signed-in collector's real place on the public board: no block or mute
 * list is applied, so the image says what everyone else sees. Null when they
 * are not ranked, the board is unknown, or the account is never ranked.
 * Text only: no team marks and no card photos.
 */
export function leaderboardRankShareModel(
  snapshot: LeaderboardSnapshot,
  userId: string | null,
  boardId: string,
  week: "current" | "previous",
): RankShareModel | null {
  const tab = leaderboardTab(boardId);
  if (!tab || !userId || isOfficialUpdatesAccount(userId) || isBrandAccount(userId)) return null;
  const slice = week === "previous" ? snapshot.previous : snapshot.current;
  const you = rankBoard(slice.boards[tab.id]?.rows ?? [], [], userId, tab.scoreLabel, { boardId: tab.id, week }).you;
  if (!you || you.rank <= 0) return null;
  const handle = you.subtitle.trim().startsWith("@") ? safe(you.subtitle.trim(), "") : "";
  // Top card post titles are card names, so that board leads with the handle.
  const name = tab.id === "top-card-post" ? handle || safe(you.title, "Collector") : safe(you.title, handle || "Collector");
  return {
    rank: you.rank,
    metal: METALS[you.rank - 1] ?? null,
    name,
    handle: name === handle ? "" : handle,
    board: safe(tab.label, "Leaderboard"),
    weekTag: week === "previous" ? LAST_WEEK_LABEL : THIS_WEEK_LABEL,
    weekLabel: safe(slice.label, ""),
    score: safe(`${you.score} ${you.scoreLabel}`, ""),
  };
}
