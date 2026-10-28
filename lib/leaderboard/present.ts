import {
  BOARD_ERROR_DETAIL,
  BOARD_ERROR_TITLE,
  CLOSED_NOTE,
  ON_BOARD_THIN_DETAIL,
  ON_BOARD_THIN_TITLE,
  OPEN_SPOT_CLOSED_LABEL,
  OPEN_SPOT_LABEL,
  FINAL_LABEL,
  LAST_WEEK_LABEL,
  LAST_WEEK_DESCRIPTION,
  LEADERBOARD_DESCRIPTION,
  LEADERBOARD_MIN_ENTRIES,
  LEADERBOARD_TITLE,
  LEADERBOARD_TOP_LIMIT,
  PROVISIONAL_LABEL,
  RULES_LINE,
  THIS_WEEK_LABEL,
  YOU_LABEL,
  boardCallToAction,
  boardLead,
  leaderboardHref,
  leaderboardPageTabs,
  scoreUnit,
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

/** A podium place (rank 1 to 3) nobody holds yet. */
export type OpenSpot = {
  rank: number;
  title: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type BoardRow = RankedEntry & {
  /** This row belongs to the signed-in viewer. Matched by user id. */
  mine: boolean;
};

export type LeaderboardBoard = {
  id: string;
  label: string;
  scoreLabel: string;
  /** Bold lead-in before `lead`. Only "You're on the board", and only this week. */
  leadTitle: string | null;
  lead: string;
  /** Fewer than LEADERBOARD_MIN_ENTRIES ranked rows. */
  thin: boolean;
  focused: boolean;
  entries: BoardRow[];
  /** Fills podium places 1 to 3 that nobody holds. Never past rank 3. */
  ghosts: OpenSpot[];
  you: YouRow | null;
  /** The viewer's row at the bottom of the board. Null when signed out or already in the top 10. */
  yourSpot: YouRow | null;
};

export type LeaderboardPageModel = {
  title: string;
  description: string;
  week: "current" | "previous";
  /** Board a `?board=` link scrolls to. */
  focusBoardId: string | null;
  weekLabel: string;
  standing: typeof PROVISIONAL_LABEL | typeof FINAL_LABEL;
  resetsAt: string;
  countdownLabel: string;
  showCountdown: boolean;
  weekLinks: { id: "current" | "previous"; label: string; href: string; active: boolean }[];
  status: "ready" | "error";
  errorTitle: string;
  errorDetail: string;
  standingNote: string | null;
  rulesLine: string;
  /** Each board's how-to lines from rules.ts, behind the info control. */
  rules: { id: string; label: string; lines: readonly string[] }[];
  viewerUserId: string | null;
  boards: LeaderboardBoard[];
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
  if (week === "previous") {
    return {
      rank: 0,
      score: 0,
      title: "Not ranked",
      subtitle: "",
      href: cta.href,
      scoreLabel,
      label: "Your rank",
      gap: "Not on this board last week.",
      ctaLabel: null,
      ctaHref: null,
    };
  }
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
  return {
    entries: ranked.slice(0, LEADERBOARD_TOP_LIMIT),
    you: youFor(best),
    thin: ranked.length < LEADERBOARD_MIN_ENTRIES,
  };
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

function openSpots(filled: number, boardId: string, week: "current" | "previous"): OpenSpot[] {
  const cta = week === "current" ? boardCallToAction(boardId, week) : null;
  const spots: OpenSpot[] = [];
  for (let rank = filled + 1; rank <= LEADERBOARD_MIN_ENTRIES; rank += 1) {
    spots.push({
      rank,
      title: cta ? OPEN_SPOT_LABEL : OPEN_SPOT_CLOSED_LABEL,
      ctaLabel: cta?.label ?? null,
      ctaHref: cta?.href ?? null,
    });
  }
  return spots;
}

export function presentLeaderboard(input: {
  snapshot: LeaderboardSnapshot;
  viewer: LeaderboardViewer;
  week: "current" | "previous";
  focusBoardId: string | null;
  now: Date;
}): LeaderboardPageModel {
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
  const viewerId = input.viewer.userId;
  const tabs = leaderboardPageTabs();
  const boards = tabs.map((tab): LeaderboardBoard => {
    const ranked = rankBoard(slice.boards[tab.id]?.rows ?? [], input.viewer.hiddenIds, viewerId, tab.scoreLabel, {
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
      mine: viewerId != null && entry.userId === viewerId,
    }));
    const onBoard = entries.some((entry) => entry.mine);
    const onThinBoard = input.week === "current" && ranked.thin && onBoard;
    return {
      id: tab.id,
      label: tab.label,
      scoreLabel: tab.scoreLabel,
      leadTitle: onThinBoard ? ON_BOARD_THIN_TITLE : null,
      lead: onThinBoard ? ON_BOARD_THIN_DETAIL : boardLead(tab.id, input.week),
      thin: ranked.thin,
      focused: tab.id === input.focusBoardId,
      entries,
      ghosts: openSpots(entries.length, tab.id, input.week),
      you: ranked.you,
      yourSpot: onBoard ? null : ranked.you,
    };
  });
  const countdown = countdownTo(new Date(input.snapshot.current.end), input.now);
  return {
    title: LEADERBOARD_TITLE,
    description: input.week === "previous" ? LAST_WEEK_DESCRIPTION : LEADERBOARD_DESCRIPTION,
    week: input.week,
    focusBoardId: boards.some((board) => board.focused) ? input.focusBoardId : null,
    weekLabel: slice.label,
    standing,
    resetsAt: input.snapshot.current.end,
    countdownLabel: countdown.label,
    showCountdown: input.week === "current",
    weekLinks: [
      {
        id: "current",
        label: THIS_WEEK_LABEL,
        href: leaderboardHref("current", ""),
        active: input.week === "current",
      },
      {
        id: "previous",
        label: LAST_WEEK_LABEL,
        href: leaderboardHref("previous", ""),
        active: input.week === "previous",
      },
    ],
    status: "ready",
    errorTitle: "",
    errorDetail: "",
    standingNote: standing === FINAL_LABEL ? CLOSED_NOTE : null,
    rulesLine: RULES_LINE,
    rules: tabs.map((tab) => ({ id: tab.id, label: tab.label, lines: tab.howTo })),
    viewerUserId: viewerId,
    boards,
  };
}

/** Shown when the shared read or the viewer block list fails. Never an unfiltered board. */
export function unavailableLeaderboard(input: {
  week: "current" | "previous";
  focusBoardId: string | null;
  now: Date;
}): LeaderboardPageModel {
  const model = presentLeaderboard({
    snapshot: emptySnapshot(input.now),
    viewer: { userId: null, hiddenIds: [] },
    week: input.week,
    focusBoardId: null,
    now: input.now,
  });
  return {
    ...model,
    status: "error",
    errorTitle: BOARD_ERROR_TITLE,
    errorDetail: BOARD_ERROR_DETAIL,
    standingNote: null,
    boards: [],
  };
}
