export type BadgeRow = {
  userId: string;
  rank: number;
};

/**
 * #1 on the day board wears "Top gainer, [date]" until the next New York day.
 * The board is rebuilt on the daily snapshot, so the chip lasts about 24 hours.
 */
export function dailyTopGainerBadge(input: {
  rank: number | null;
  dateLabel: string;
}): string | null {
  if (input.rank !== 1 || !input.dateLabel) return null;
  return `Top gainer, ${input.dateLabel}`;
}

/** Week's top 3, and only on a Monday in America/New_York. */
export function weeklyTopBadge(input: { rank: number | null; monday: boolean }): string | null {
  if (!input.monday) return null;
  if (input.rank == null || input.rank < 1 || input.rank > 3) return null;
  return "Top 3 this week";
}

export function leaderboardBadgeChips(input: {
  userId: string;
  day: readonly BadgeRow[];
  week: readonly BadgeRow[];
  monday: boolean;
  dateLabel: string;
  hidden: boolean;
}): string[] {
  if (input.hidden || !input.userId) return [];
  const dayRank = input.day.find((row) => row.userId === input.userId)?.rank ?? null;
  const weekRank = input.week.find((row) => row.userId === input.userId)?.rank ?? null;
  const chips: string[] = [];
  const daily = dailyTopGainerBadge({ rank: dayRank, dateLabel: input.dateLabel });
  if (daily) chips.push(daily);
  const weekly = weeklyTopBadge({ rank: weekRank, monday: input.monday });
  if (weekly) chips.push(weekly);
  return chips;
}
