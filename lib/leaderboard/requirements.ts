import {
  accountOldEnough,
  isLeaderboardEligible,
  leaderboardMinimums,
  type LeaderboardMinimums,
} from "./eligibility";

export const LEADERBOARD_HOW_TO = "How to get on the leaderboard";

export const LEADERBOARD_ON_BOARD = "You're on the board";

export const LEADERBOARD_SAME_CARDS_NOTE =
  "Rankings compare the same cards over the week. Only cards held at the start of the week count. Adding cards does not count.";

export const LEADERBOARD_OPT_IN_HREF = "/settings/privacy#show-on-leaderboards";

export function leaderboardMoney(value: number): string {
  const whole = Number.isInteger(value);
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** One line, built from the same floors as the board. */
export function leaderboardRequirementsLine(
  minimums: LeaderboardMinimums = leaderboardMinimums(),
): string {
  return `Public collection, show me on leaderboards, at least ${minimums.minCards} trusted cards worth ${leaderboardMoney(minimums.minValue)}, and an account at least ${minimums.minAccountDays} days old.`;
}

export type LeaderboardChecklistItem = {
  id: string;
  label: string;
  met: boolean;
  href?: string;
};

export type LeaderboardChecklist = {
  openByDefault: boolean;
  eligible: boolean;
  status: string | null;
  line: string;
  sameCardsNote: string;
  items: LeaderboardChecklistItem[];
  showChecks: boolean;
};

export function leaderboardChecklist(input: {
  signedIn: boolean;
  checksReady: boolean;
  publicCollection: boolean;
  optedIn: boolean;
  trustedCards: number;
  value: number;
  accountCreatedAt?: string | null;
  username?: string;
  isTest?: boolean;
  now?: Date;
  minimums?: LeaderboardMinimums;
  /** Open the how-to box while the public board is still thin. */
  boardClosed?: boolean;
}): LeaderboardChecklist {
  const minimums = input.minimums ?? leaderboardMinimums();
  const now = input.now ?? new Date();
  const cardsLabel = `${input.trustedCards} of ${minimums.minCards} valued cards`;
  const items: LeaderboardChecklistItem[] = [
    { id: "public", label: "Public collection", met: input.publicCollection },
    {
      id: "opt-in",
      label: "Show me on leaderboards",
      met: input.optedIn,
      href: LEADERBOARD_OPT_IN_HREF,
    },
    {
      id: "cards",
      label: cardsLabel,
      met: input.trustedCards >= minimums.minCards,
    },
    {
      id: "value",
      label: `Total at least ${leaderboardMoney(minimums.minValue)}`,
      met: input.value >= minimums.minValue,
    },
    {
      id: "age",
      label: `Account at least ${minimums.minAccountDays} days old`,
      met: accountOldEnough(input.accountCreatedAt, now, minimums.minAccountDays),
    },
  ];
  const eligible = isLeaderboardEligible({
    optedIn: input.optedIn,
    publicCollection: input.publicCollection,
    valuedCards: input.trustedCards,
    value: input.value,
    username: input.username ?? "",
    accountCreatedAt: input.accountCreatedAt,
    now,
    isTest: input.isTest,
    minCards: minimums.minCards,
    minValue: minimums.minValue,
    minAccountDays: minimums.minAccountDays,
  });
  const showChecks = input.signedIn && input.checksReady;
  return {
    openByDefault: Boolean(input.boardClosed) || (showChecks && !eligible),
    eligible,
    status: showChecks && eligible ? LEADERBOARD_ON_BOARD : null,
    line: leaderboardRequirementsLine(minimums),
    sameCardsNote: LEADERBOARD_SAME_CARDS_NOTE,
    items,
    showChecks,
  };
}
