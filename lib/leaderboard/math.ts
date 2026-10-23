export const TRUSTED_MIN_SALES = 2;
export const TRUSTED_MIN_MEDIAN = 5;
export const VALUE_PERCENT_CAP = 1;

export type ValueCard = {
  cardId: string;
  startMedian: number | null;
  endMedian: number | null;
  startSales: number | null;
  endSales: number | null;
  selfReported: boolean;
  openFlag: boolean;
  /** Same player, year, set, parallel, grade, and grader. Defaults to the card id. */
  identityKey?: string | null;
  /** End value was already resolved to the last trusted price, or 0. */
  endResolved?: boolean;
  /** Identity changed during the week, so this card adds nothing. */
  identityChanged?: boolean;
};

export type ValueFlagReason = "single_sale" | "self_reported";

export type ValueBoardChange = {
  /** Null when no trusted card remains, so the percent is not a divide-by-zero. */
  percent: number | null;
  /** Capped dollar move. Used to break ties. Never shown. */
  dollarGain: number;
  startSum: number;
  cardCount: number;
  flagged: boolean;
  flagReasons: ValueFlagReason[];
};

function finite(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function trustedMedian(value: number | null, sales: number | null): number | null {
  const median = finite(value);
  const count = finite(sales);
  if (median == null || count == null) return null;
  if (count < TRUSTED_MIN_SALES) return null;
  if (median < TRUSTED_MIN_MEDIAN) return null;
  return median;
}

/**
 * Cap each positive move so it cannot exceed the other positive moves.
 * That move is then at most half of the positive gain. Negative moves stay.
 * A lone positive move is capped to zero.
 */
export function capPositiveDeltas(deltas: readonly number[]): number[] {
  const next = deltas.slice();
  for (let pass = 0; pass < next.length; pass += 1) {
    let changed = false;
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] <= 0) continue;
      let others = 0;
      for (let other = 0; other < next.length; other += 1) {
        if (other !== index && next[other] > 0) others += next[other];
      }
      if (next[index] > others) {
        next[index] = others;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

function resolvedEnd(card: ValueCard, start: number): number | null {
  if (card.identityChanged) return start;
  if (card.endResolved) {
    const end = finite(card.endMedian);
    return end == null ? 0 : end;
  }
  return trustedMedian(card.endMedian, card.endSales);
}

/**
 * Same-cards percent for cards already limited to the week's starting lineup.
 * Trusted prices need two matched sales and a median of at least $5 at the start.
 * An end that is no longer trusted uses the resolved value, including 0.
 * An open wrong-sale report freezes the card. The 50% cap is per identity, so
 * duplicate copies cannot each take a full uncapped gain. The returned percent
 * never exceeds +100%.
 */
export function valueBoardChange(cards: readonly ValueCard[]): ValueBoardChange {
  const groups = new Map<
    string,
    { start: number; rawDelta: number; selfReported: boolean; singleSale: boolean }
  >();
  const seen = new Set<string>();
  let cardCount = 0;

  for (const card of cards) {
    if (!card.cardId || seen.has(card.cardId) || card.openFlag) continue;
    const start = trustedMedian(card.startMedian, card.startSales);
    if (start == null) continue;
    const end = resolvedEnd(card, start);
    if (end == null) continue;
    seen.add(card.cardId);
    cardCount += 1;
    const rawDelta = end - start;
    const key = card.identityKey?.trim() || card.cardId;
    const startSales = finite(card.startSales);
    const endSales = card.identityChanged ? startSales : finite(card.endSales);
    const singleSale =
      startSales != null && endSales != null && endSales === startSales + 1 && rawDelta > 0;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        start,
        rawDelta,
        selfReported: card.selfReported,
        singleSale,
      });
    } else {
      existing.start += start;
      existing.rawDelta += rawDelta;
      existing.selfReported = existing.selfReported || card.selfReported;
      existing.singleSale = existing.singleSale || singleSale;
    }
  }

  const included = [...groups.values()];
  if (included.length === 0) {
    return {
      percent: null,
      dollarGain: 0,
      startSum: 0,
      cardCount: 0,
      flagged: false,
      flagReasons: [],
    };
  }

  const capped = capPositiveDeltas(included.map((group) => group.rawDelta));
  let startSum = 0;
  let dollarGain = 0;
  const reasons = new Set<ValueFlagReason>();
  for (let index = 0; index < included.length; index += 1) {
    const group = included[index];
    startSum += group.start;
    dollarGain += capped[index];
    if (group.rawDelta > 0 && group.selfReported) reasons.add("self_reported");
    if (group.singleSale) reasons.add("single_sale");
  }

  const flagReasons = [...reasons];
  const raw = startSum > 0 ? dollarGain / startSum : null;
  return {
    percent: raw == null ? null : Math.min(raw, VALUE_PERCENT_CAP),
    dollarGain,
    startSum,
    cardCount,
    flagged: flagReasons.length > 0,
    flagReasons,
  };
}

export function valuePercentLabel(percent: number): string {
  if (percent >= VALUE_PERCENT_CAP) return "+100% or more";
  const magnitude = Math.abs(percent * 100).toFixed(1);
  if (magnitude === "0.0") return "+0.0%";
  const sign = percent > 0 ? "+" : "−";
  return `${sign}${magnitude}%`;
}

export type ValueRankable = {
  userId: string;
  username: string;
  percent: number;
  dollarGain: number;
};

/**
 * Highest capped percent first. +100% or more ties break on the capped dollar
 * gain, then the handle. The dollar gain is not displayed.
 */
export function rankValueBoard<T extends ValueRankable>(
  rows: readonly T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    const percent = Math.min(b.percent, VALUE_PERCENT_CAP) - Math.min(a.percent, VALUE_PERCENT_CAP);
    if (percent !== 0) return percent;
    if (b.dollarGain !== a.dollarGain) return b.dollarGain - a.dollarGain;
    const handle = a.username.localeCompare(b.username);
    if (handle !== 0) return handle;
    return a.userId.localeCompare(b.userId);
  });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}
