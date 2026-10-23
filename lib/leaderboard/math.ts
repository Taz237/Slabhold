export type MedianPoint = {
  cardId: string;
  median: number | null;
};

export type SameCardsChange = {
  priorSum: number;
  todaySum: number;
  delta: number;
  /** Null when the prior sum is 0, so the percent is not a divide-by-zero. */
  percent: number | null;
  cardCount: number;
};

function finiteMedian(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Same-cards change. Cards only on one date are ignored.
 * A null median on either date is ignored. Each card counts once.
 * percent = sum(today - prior) / sum(prior).
 */
export function sameCardsChange(input: {
  prior: readonly MedianPoint[];
  today: readonly MedianPoint[];
}): SameCardsChange {
  const priorById = new Map<string, number>();
  for (const row of input.prior) {
    const median = finiteMedian(row.median);
    if (median == null || !row.cardId) continue;
    priorById.set(row.cardId, median);
  }

  let priorSum = 0;
  let todaySum = 0;
  let cardCount = 0;
  const seen = new Set<string>();
  for (const row of input.today) {
    if (!row.cardId || seen.has(row.cardId)) continue;
    const todayMedian = finiteMedian(row.median);
    if (todayMedian == null) continue;
    const priorMedian = priorById.get(row.cardId);
    if (priorMedian == null) continue;
    seen.add(row.cardId);
    priorSum += priorMedian;
    todaySum += todayMedian;
    cardCount += 1;
  }

  const delta = todaySum - priorSum;
  return {
    priorSum,
    todaySum,
    delta,
    percent: priorSum > 0 ? delta / priorSum : null,
    cardCount,
  };
}

export type Rankable = {
  userId: string;
  username: string;
  percent: number;
  delta: number;
};

/** Gainers: highest percent first. Losers: lowest percent first. Ties break on dollars, then handle. */
export function rankLeaderboard<T extends Rankable>(
  rows: readonly T[],
  direction: "gainers" | "losers",
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    const percent = direction === "gainers" ? b.percent - a.percent : a.percent - b.percent;
    if (percent !== 0) return percent;
    const dollars = direction === "gainers" ? b.delta - a.delta : a.delta - b.delta;
    if (dollars !== 0) return dollars;
    const handle = a.username.localeCompare(b.username);
    if (handle !== 0) return handle;
    return a.userId.localeCompare(b.userId);
  });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}
