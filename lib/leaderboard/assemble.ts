import { valueBracketLabel, type ValueBracketId } from "./brackets";
import { LEADERBOARD_MIN_COLLECTORS, leaderboardOpens } from "./eligibility";
import {
  VALUE_PERCENT_CAP,
  rankValueBoard,
  valueBoardChange,
  valuePercentLabel,
  type ValueCard,
} from "./math";

export type ValueBoardSourceCard = ValueCard & {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: string;
  bracket: ValueBracketId | null;
};

export type AssembledBracket = {
  id: string;
  label: string;
  open: boolean;
  rows: {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    accent: string;
    percent: number;
    percentLabel: string;
    flagged: boolean;
    rank: number;
  }[];
};

/**
 * Group eligible card rows into brackets and rank each one.
 * Dollar gains stay inside the sort and are not part of the result.
 */
export function assembleValueBoard(cards: readonly ValueBoardSourceCard[]): AssembledBracket[] {
  const byUser = new Map<
    string,
    {
      username: string;
      displayName: string;
      avatarUrl: string | null;
      accent: string;
      bracket: ValueBracketId | null;
      cards: ValueCard[];
    }
  >();

  for (const card of cards) {
    if (!card.userId) continue;
    let group = byUser.get(card.userId);
    if (!group) {
      group = {
        username: card.username,
        displayName: card.displayName || card.username,
        avatarUrl: card.avatarUrl,
        accent: card.accent || "#7c5cff",
        bracket: card.bracket,
        cards: [],
      };
      byUser.set(card.userId, group);
    }
    group.cards.push(card);
  }

  type Pending = {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    accent: string;
    percent: number;
    percentLabel: string;
    flagged: boolean;
    dollarGain: number;
  };
  const grouped = new Map<ValueBracketId, Pending[]>();
  for (const [userId, group] of byUser) {
    if (!group.bracket || !group.username) continue;
    const change = valueBoardChange(group.cards);
    if (change.percent == null) continue;
    const list = grouped.get(group.bracket) ?? [];
    list.push({
      userId,
      username: group.username,
      displayName: group.displayName,
      avatarUrl: group.avatarUrl,
      accent: group.accent,
      percent: change.percent,
      percentLabel: valuePercentLabel(change.percent),
      flagged: change.flagged,
      dollarGain: change.dollarGain,
    });
    grouped.set(group.bracket, list);
  }

  const order: ValueBracketId[] = ["under-1k", "1k-10k", "10k-plus"];
  const brackets: AssembledBracket[] = [];
  for (const id of order) {
    const rows = grouped.get(id) ?? [];
    const open = leaderboardOpens(rows.length, LEADERBOARD_MIN_COLLECTORS);
    brackets.push({
      id,
      label: valueBracketLabel(id),
      open,
      rows: open
        ? rankValueBoard(rows).map((row) => {
            const percent = Math.min(row.percent, VALUE_PERCENT_CAP);
            return {
              userId: row.userId,
              username: row.username,
              displayName: row.displayName,
              avatarUrl: row.avatarUrl,
              accent: row.accent,
              percent,
              percentLabel: valuePercentLabel(percent),
              flagged: row.flagged,
              rank: row.rank,
            };
          })
        : [],
    });
  }
  return brackets;
}
