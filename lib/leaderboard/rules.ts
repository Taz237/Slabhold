import { TEST_ACCOUNT_PREFIXES } from "@/lib/test-accounts";

/** Weeks and the reset countdown use this zone. */
export const LEADERBOARD_TIME_ZONE = "America/New_York";

/** Monday 00:00 through the following Monday 00:00, exclusive. Sunday 23:59 is inside. */
export const WEEK_START_WEEKDAY = 1;

/** Results stay Provisional until this weekday at 00:00 in LEADERBOARD_TIME_ZONE. Tuesday. */
export const FINAL_WEEKDAY = 2;

export const LEADERBOARD_TOP_LIMIT = 10;

/** Fewer qualifying rows than this, and the board shows the thin state. */
export const LEADERBOARD_MIN_ENTRIES = 3;

/** Likes, replies, and follows only count from accounts at least this many days old. */
export const ACTOR_MIN_AGE_DAYS = 7;

/** The actor also needs at least this many cards or this many posts. */
export const ACTOR_MIN_CONTENT = 1;

/** Shared read of the boards. Viewer rows are applied after this. */
export const LEADERBOARD_CACHE_SECONDS = 5 * 60;

export const LEADERBOARD_PATH = "/leaderboard";

export const LEADERBOARD_TITLE = "Leaderboard";

export const LEADERBOARD_DESCRIPTION =
  "This week's card posts and collectors with new followers.";

export const THIN_BOARD_TITLE = "Board fills up as collectors post and follow";

export const PROVISIONAL_LABEL = "Provisional";

export const FINAL_LABEL = "Final";

export const THIS_WEEK_LABEL = "This week";

export const LAST_WEEK_LABEL = "Last week";

export const YOU_LABEL = "You";

/** Left off Rising collectors. Everyone auto-follows this account. */
export const OFFICIAL_UPDATES_HANDLE = "slabholdupdates";

/**
 * Reserved id for the collection % gainers board. Another builder owns that
 * board. It is not in LEADERBOARD_TABS, so the page does not show it.
 */
export const VALUE_BOARD_ID = "value";

export type LeaderboardBoardId = "top-card-post" | "rising-collectors" | typeof VALUE_BOARD_ID;

export type LeaderboardTab = {
  id: LeaderboardBoardId;
  label: string;
  scoreLabel: string;
  /** Plain-language rules. Built from the constants the scorer uses. */
  howTo: readonly string[];
};

export const TOP_CARD_LEAD = "Post a card. Likes and replies from real collectors count.";

export const RISING_LEAD = "Get follows from real collectors this week.";

export function realCollectorRule(): string {
  return `A real collector has had an account for at least ${ACTOR_MIN_AGE_DAYS} days and has at least ${ACTOR_MIN_CONTENT} card or ${ACTOR_MIN_CONTENT} post.`;
}

export function testAccountRule(): string {
  return `Test accounts are left out, including handles starting with ${TEST_ACCOUNT_PREFIXES.join(", ")}.`;
}

export function officialUpdatesRule(): string {
  return `The official @${OFFICIAL_UPDATES_HANDLE} account is left off this board.`;
}

const SHARED_ACTOR_RULES = [realCollectorRule(), testAccountRule()] as const;

/**
 * Boards the page shows, in order. Append the Value board here when it is ready.
 * Leave VALUE_BOARD_ID out until then.
 */
export const LEADERBOARD_TABS: readonly LeaderboardTab[] = [
  {
    id: "top-card-post",
    label: "Top card post",
    scoreLabel: "likes and replies",
    howTo: [
      TOP_CARD_LEAD,
      ...SHARED_ACTOR_RULES,
      "Your own likes and replies do not count.",
      "One like per collector per post. Undone likes do not count.",
      "Hidden or deleted posts and private cards do not count.",
    ],
  },
  {
    id: "rising-collectors",
    label: "Rising collectors",
    scoreLabel: "new followers",
    howTo: [
      RISING_LEAD,
      "New follows this week count. Follows removed this week come off when that removal is still on record.",
      ...SHARED_ACTOR_RULES,
      officialUpdatesRule(),
    ],
  },
];

export function leaderboardTab(id: string): LeaderboardTab | null {
  return LEADERBOARD_TABS.find((tab) => tab.id === id) ?? null;
}

export function leaderboardHref(week: "current" | "previous", boardId: string): string {
  const params = new URLSearchParams();
  if (week === "previous") params.set("week", "last");
  const first = LEADERBOARD_TABS[0]?.id;
  if (boardId && boardId !== first) params.set("board", boardId);
  const query = params.toString();
  return query ? `${LEADERBOARD_PATH}?${query}` : LEADERBOARD_PATH;
}

export function parseLeaderboardQuery(
  week: string | undefined,
  board: string | undefined,
): { week: "current" | "previous"; boardId: string } {
  const known = leaderboardTab(board ?? "");
  return {
    week: week === "last" ? "previous" : "current",
    boardId: known?.id ?? LEADERBOARD_TABS[0].id,
  };
}
