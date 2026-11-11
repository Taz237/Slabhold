/**
 * Collection performance from price movement only, like a brokerage's
 * time-weighted return. Each day's return compares only the cards held on
 * both that day and the day before:
 *
 *   return(d) = Σ value(d) / Σ value(d − 1) − 1   over cards held both days
 *
 * which is (value_end − value_added) / value_start − 1 with removals taken out
 * of the start. Days chain by multiplying (1 + return). A card's first value
 * is its baseline, never a gain, and a sold or removed card leaves without
 * counting as a loss. Pure: no reads, no dates from the clock.
 */

/** One card's value on one day. */
export type CardDay = { cardId: string; date: string; value: number };

/** A day's return counts only when the cards it compares were worth at least this. */
export const MIN_BASE = 1;

export type PerformancePoint = {
  date: string;
  /** Held value that day: the cards' values added up. */
  value: number;
  /** Growth of $1 since the first day, market moves only. 1 is flat. */
  growth: number;
  /** Market move in dollars since the first day. */
  move: number;
  /** Days so far whose return counted (a base of MIN_BASE or more). */
  counted: number;
  /** Cards first held this day. Empty on the first day: those are the baseline. */
  added: string[];
};

/** Daily performance, oldest first. One point per date that has a row. */
export function performanceSeries(rows: readonly CardDay[]): PerformancePoint[] {
  const byDate = new Map<string, Map<string, number>>();
  const span = new Map<string, { first: string; last: string }>();
  for (const row of rows) {
    if (!row.cardId || !row.date || !Number.isFinite(row.value)) continue;
    let day = byDate.get(row.date);
    if (!day) byDate.set(row.date, (day = new Map()));
    day.set(row.cardId, row.value);
    const seen = span.get(row.cardId);
    if (!seen) span.set(row.cardId, { first: row.date, last: row.date });
    else {
      if (row.date < seen.first) seen.first = row.date;
      if (row.date > seen.last) seen.last = row.date;
    }
  }
  const dates = [...byDate.keys()].sort();
  const points: PerformancePoint[] = [];
  // A card is held from its first row to its last; a day with no row in between keeps its last value.
  const carried = new Map<string, number>();
  let previous = new Map<string, number>();
  let growth = 1;
  let move = 0;
  let counted = 0;
  for (const [index, date] of dates.entries()) {
    const rowsToday = byDate.get(date) as Map<string, number>;
    const held = new Map<string, number>();
    for (const [cardId, { first, last }] of span) {
      if (date < first || date > last) continue;
      const value = rowsToday.get(cardId) ?? carried.get(cardId);
      if (value == null) continue;
      carried.set(cardId, value);
      held.set(cardId, value);
    }
    const added: string[] = [];
    let base = 0;
    let end = 0;
    for (const [cardId, value] of held) {
      const before = previous.get(cardId);
      if (before == null) {
        if (index > 0) added.push(cardId);
        continue;
      }
      base += before;
      end += value;
    }
    if (index > 0) {
      move += end - base;
      if (base >= MIN_BASE) {
        growth *= end / base;
        counted += 1;
      }
    }
    let value = 0;
    for (const amount of held.values()) value += amount;
    points.push({ date, value: cents(value), growth, move, counted, added: added.sort() });
    previous = held;
  }
  return points;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export type MarketMove = { delta: number; pct: number | null; up: boolean };

/**
 * First to last point: the dollars and % from price movement alone. Null when
 * there is not enough history: under two points, or no day in between with a
 * base of MIN_BASE or more, so a % never comes from a near-zero base.
 */
export function marketMove(points: readonly PerformancePoint[]): MarketMove | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (last.counted - first.counted < 1) return null;
  const delta = cents(last.move - first.move);
  const pct = (last.growth / first.growth - 1) * 100;
  const clean = Math.abs(pct) < 1e-9 ? 0 : pct;
  return { delta, pct: clean, up: delta >= 0 };
}

/** A chart point for Performance: `value` is the % since the range's first point. */
export type IndexPoint = { date: string; value: number; dollars: number; marker: string | null };

/** The range as a % line that starts at 0%. Adds never move it. */
export function indexPoints(
  points: readonly PerformancePoint[],
  markers?: Map<string, string>,
): IndexPoint[] {
  if (!points.length) return [];
  const base = points[0].growth;
  return points.map((point) => {
    const pct = (point.growth / base - 1) * 100;
    return {
      date: point.date,
      value: Math.abs(pct) < 1e-9 ? 0 : pct,
      dollars: point.value,
      marker: markers?.get(point.date) ?? null,
    };
  });
}

/** A saved per-card row. `held` is null where the column is not there yet. */
export type SavedCardDay = CardDay & { held: boolean | null };

/** What the assembly needs from a card in the collection. */
export type PerformanceCard = {
  id: string;
  sold: boolean;
  /** YYYY-MM-DD the card was sold, when known. */
  soldOn: string | null;
  /** Today's live value, null without one. */
  live: number | null;
};

/**
 * The rows performance is measured on: only cards in this collection (a
 * deleted card is simply gone), never a sold card from its sale day on, and
 * today from the live values once they load, so the line ends on the header.
 */
export function cardDaysForCollection(
  rows: readonly SavedCardDay[],
  cards: readonly PerformanceCard[],
  { today, live }: { today: string; live: boolean },
): CardDay[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const out: CardDay[] = [];
  for (const row of rows) {
    const card = byId.get(row.cardId);
    if (!card || row.held === false) continue;
    if (live && row.date === today) continue;
    if (card.sold && row.held == null && (card.soldOn == null || row.date >= card.soldOn)) continue;
    out.push({ cardId: row.cardId, date: row.date, value: row.value });
  }
  if (live) {
    for (const card of cards) {
      if (card.sold || card.live == null) continue;
      out.push({ cardId: card.id, date: today, value: card.live });
    }
  }
  return out;
}
