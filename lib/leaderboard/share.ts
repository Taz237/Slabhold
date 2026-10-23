import { stripUnsupportedOgText } from "@/lib/og/safe-text";
import type { LeaderboardSnapshot } from "./present";
import { LEADERBOARD_DESCRIPTION, LEADERBOARD_TABS, LEADERBOARD_TITLE, THIN_BOARD_TITLE } from "./rules";
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

export function leaderboardShareDescription(): string {
  return LEADERBOARD_DESCRIPTION;
}
