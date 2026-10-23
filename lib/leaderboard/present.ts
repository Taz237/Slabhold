import {
  BOARD_ERROR_DETAIL,
  BOARD_ERROR_TITLE,
  CLOSED_NOTE,
  EMPTY_BOARD_TITLE,
  FINAL_LABEL,
  LAST_WEEK_LABEL,
  LAST_WEEK_DESCRIPTION,
  LEADERBOARD_DESCRIPTION,
  MOST_CARDS_LEAD_LAST_WEEK,
  RISING_LEAD_LAST_WEEK,
  LEADERBOARD_MIN_ENTRIES,
  LEADERBOARD_TABS,
  LEADERBOARD_TITLE,
  LEADERBOARD_TOP_LIMIT,
  PROVISIONAL_LABEL,
  THIS_WEEK_LABEL,
  YOU_LABEL,
  boardCallToAction,
  leaderboardHref,
  scoreUnit,
  leaderboardTab,
} from "./rules";
import type { CandidateRow, Contribution, WeekBoards } from "./score";
import { emptySnapshot } from "./snapshot";
import { countdownTo, weekStanding } from "./week";

export type RankedEntry = {
  id: string;
  userId: string;
  rank: number;
  score: number;
  title: string;
  subtitle: string;
  href: string;
  avatarUrl: string | null;
  accent: string;
  scoreLabel: string;
  /** True when this user was not on the same board last week. */
  isNew: boolean;
};

export type YouRow = {
  rank: number;
  score: number;
  title: string;
  subtitle: string;
  href: string;
  scoreLabel: string;
  label: string;
  gap: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type LeaderboardWeekSlice = {
  start: string;
  end: string;
  finalAt: string;
  label: string;
  boards: WeekBoards;
};

export type LeaderboardSnapshot = {
  generatedAt: string;
  current: LeaderboardWeekSlice;
  previous: LeaderboardWeekSlice;
};

export type LeaderboardViewer = {
  userId: string | null;
  /** Accounts this viewer blocked or muted. Not part of the shared snapshot. */
  hiddenIds: readonly string[];
};

export type LeaderboardPageModel = {
  title: string;
  description: string;
  week: "current" | "previous";
  boardId: string;
  weekLabel: string;
  standing: typeof PROVISIONAL_LABEL | typeof FINAL_LABEL;
  resetsAt: string;
  countdownLabel: string;
  showCountdown: boolean;
  weekLinks: { id: "current" | "previous"; label: string; href: string; active: boolean }[];
  tabs: { id: string; label: string; href: string; active: boolean }[];
  status: "ready" | "error";
  errorTitle: string;
  errorDetail: string;
  standingNote: string | null;
  thin: boolean;
  thinTitle: string;
  thinDetail: string;
  entries: RankedEntry[];
  you: YouRow | null;
  howTo: { id: string; label: string; lines: readonly string[] }[];
  /** Lead line per board, from the same tab rules as howTo. */
  checklist: { id: string; label: string; line: string }[];
};

function scoreOf(contributions: readonly Contribution[], hidden: ReadonlySet<string>): number {
  let total = 0;
  for (const row of contributions) {
    if (hidden.has(row.actorId)) continue;
    total += row.points;
  }
  return total;
}

function rivalHandle(entry: RankedEntry): string {
  const subtitle = entry.subtitle.trim();
  if (subtitle.startsWith("@")) return subtitle;
  const title = entry.title.trim().replace(/^@/, "");
  return title ? `@${title}` : "the next spot";
}

function gapLine(need: number, scoreLabel: string, handle: string, reachTopTen: boolean): string {
  const unit = scoreUnit(scoreLabel, need);
  if (reachTopTen) return `${need} more ${unit} to reach the top 10`;
  return `${need} more ${unit} to pass ${handle}`;
}

function unrankedYou(boardId: string, week: "current" | "previous", scoreLabel: string): YouRow {
  const cta = boardCallToAction(boardId, week);
  return {
    rank: 0,
    score: 0,
    title: "Not ranked",
    subtitle: "",
    href: cta.href,
    scoreLabel,
    label: "Your rank",
    gap: cta.step,
    ctaLabel: cta.label,
    ctaHref: cta.href,
  };
}

export function rankBoard(
  rows: readonly CandidateRow[],
  hiddenIds: readonly string[],
  viewerId: string | null,
  scoreLabel: string,
  options?: { boardId?: string; week?: "current" | "previous" },
): { entries: RankedEntry[]; you: YouRow | null; thin: boolean } {
  const boardId = options?.boardId ?? "top-card-post";
  const week = options?.week ?? "current";
  const hidden = new Set(hiddenIds);
  if (viewerId) hidden.delete(viewerId);
  const ranked: RankedEntry[] = [];
  for (const row of rows) {
    if (hidden.has(row.userId)) continue;
    const score = scoreOf(row.contributions, hidden);
    if (score <= 0) continue;
    ranked.push({
      id: row.id,
      userId: row.userId,
      rank: 0,
      score,
      title: row.title,
      subtitle: row.subtitle,
      href: row.href,
      avatarUrl: row.avatarUrl,
      accent: row.accent,
      scoreLabel: scoreUnit(scoreLabel, score),
      isNew: false,
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  const youFor = (best: RankedEntry | null): YouRow | null => {
    if (!viewerId) return null;
    if (!best) return unrankedYou(boardId, week, scoreLabel);
    if (best.rank === 1) {
      return {
        rank: best.rank,
        score: best.score,
        title: best.title,
        subtitle: best.subtitle,
        href: best.href,
        scoreLabel: best.scoreLabel,
        label: `${YOU_LABEL}: #${best.rank}`,
        gap: "You're in the top spot",
        ctaLabel: null,
        ctaHref: null,
      };
    }
    const reachTopTen = best.rank > LEADERBOARD_TOP_LIMIT;
    const ahead = reachTopTen ? ranked[LEADERBOARD_TOP_LIMIT - 1] : ranked[best.rank - 2];
    const need = ahead ? Math.max(1, ahead.score - best.score) : 1;
    return {
      rank: best.rank,
      score: best.score,
      title: best.title,
      subtitle: best.subtitle,
      href: best.href,
      scoreLabel: best.scoreLabel,
      label: `${YOU_LABEL}: #${best.rank}`,
      gap: ahead ? gapLine(need, scoreLabel, rivalHandle(ahead), reachTopTen) : "",
      ctaLabel: null,
      ctaHref: null,
    };
  };
  const best = bestForViewer(ranked, viewerId);
  if (ranked.length < LEADERBOARD_MIN_ENTRIES) {
    return { entries: [], you: thinViewerYou(best, boardId, week, scoreLabel, viewerId), thin: true };
  }
  return { entries: ranked.slice(0, LEADERBOARD_TOP_LIMIT), you: youFor(best), thin: false };
}

function bestForViewer(ranked: readonly RankedEntry[], viewerId: string | null): RankedEntry | null {
  if (!viewerId) return null;
  let best: RankedEntry | null = null;
  for (const row of ranked) {
    if (row.userId !== viewerId) continue;
    if (best == null || row.rank < best.rank) best = row;
  }
  return best;
}

function thinViewerYou(
  best: RankedEntry | null,
  boardId: string,
  week: "current" | "previous",
  scoreLabel: string,
  viewerId: string | null,
): YouRow | null {
  if (!viewerId) return null;
  if (!best || best.score <= 0) return unrankedYou(boardId, week, scoreLabel);
  return {
    rank: 0,
    score: best.score,
    title: best.title,
    subtitle: best.subtitle,
    href: best.href,
    scoreLabel: best.scoreLabel,
    label: `${YOU_LABEL}: ${best.score} ${best.scoreLabel}`,
    gap: "",
    ctaLabel: null,
    ctaHref: null,
  };
}

export function presentLeaderboard(input: {
  snapshot: LeaderboardSnapshot;
  viewer: LeaderboardViewer;
  week: "current" | "previous";
  boardId: string;
  now: Date;
}): LeaderboardPageModel {
  const tab = leaderboardTab(input.boardId) ?? LEADERBOARD_TABS[0];
  const slice = input.week === "previous" ? input.snapshot.previous : input.snapshot.current;
  const standing = weekStanding(
    {
      start: new Date(slice.start),
      end: new Date(slice.end),
      finalAt: new Date(slice.finalAt),
      startDate: "",
      endDate: "",
      label: slice.label,
    },
    input.now,
  );
  const board = slice.boards[tab.id];
  const ranked = rankBoard(board?.rows ?? [], input.viewer.hiddenIds, input.viewer.userId, tab.scoreLabel, {
    boardId: tab.id,
    week: input.week,
  });
  const priorUsers = new Set(
    input.week === "current"
      ? (input.snapshot.previous.boards[tab.id]?.rows ?? []).map((row) => row.userId)
      : [],
  );
  const entries = ranked.entries.map((entry) => ({
    ...entry,
    isNew: input.week === "current" && !priorUsers.has(entry.userId),
  }));
  const countdown = countdownTo(new Date(input.snapshot.current.end), input.now);
  return {
    title: LEADERBOARD_TITLE,
    description: input.week === "previous" ? LAST_WEEK_DESCRIPTION : LEADERBOARD_DESCRIPTION,
    week: input.week,
    boardId: tab.id,
    weekLabel: slice.label,
    standing,
    resetsAt: input.snapshot.current.end,
    countdownLabel: countdown.label,
    showCountdown: input.week === "current",
    weekLinks: [
      {
        id: "current",
        label: THIS_WEEK_LABEL,
        href: leaderboardHref("current", tab.id),
        active: input.week === "current",
      },
      {
        id: "previous",
        label: LAST_WEEK_LABEL,
        href: leaderboardHref("previous", tab.id),
        active: input.week === "previous",
      },
    ],
    tabs: LEADERBOARD_TABS.map((item) => ({
      id: item.id,
      label: item.label,
      href: leaderboardHref(input.week, item.id),
      active: item.id === tab.id,
    })),
    status: "ready",
    errorTitle: "",
    errorDetail: "",
    standingNote: standing === FINAL_LABEL ? CLOSED_NOTE : null,
    thin: ranked.thin,
    thinTitle: EMPTY_BOARD_TITLE,
    thinDetail:
      tab.id === "rising-collectors" && input.week === "previous"
        ? RISING_LEAD_LAST_WEEK
        : tab.id === "most-cards-added" && input.week === "previous"
          ? MOST_CARDS_LEAD_LAST_WEEK
          : (tab.howTo[0] ?? EMPTY_BOARD_TITLE),
    entries,
    you: ranked.you,
    howTo: LEADERBOARD_TABS.map((item) => ({
      id: item.id,
      label: item.label,
      lines: item.howTo,
    })),
    checklist: LEADERBOARD_TABS.map((item) => ({
      id: item.id,
      label: item.label,
      line: item.howTo[0] ?? "",
    })),
  };
}

/** Shown when the shared read or the viewer block list fails. Never an unfiltered board. */
export function unavailableLeaderboard(input: {
  week: "current" | "previous";
  boardId: string;
  now: Date;
}): LeaderboardPageModel {
  const model = presentLeaderboard({
    snapshot: emptySnapshot(input.now),
    viewer: { userId: null, hiddenIds: [] },
    week: input.week,
    boardId: input.boardId,
    now: input.now,
  });
  return {
    ...model,
    status: "error",
    errorTitle: BOARD_ERROR_TITLE,
    errorDetail: BOARD_ERROR_DETAIL,
    standingNote: null,
    thin: false,
    entries: [],
    you: null,
  };
}
