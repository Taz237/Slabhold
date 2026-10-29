import { dollarsToCents } from "@/lib/comps/stats";
import { userHref } from "@/lib/social/user-href";
import { isUuid } from "@/lib/value/card-value-access";
import {
  emptyMovingToday,
  MOVING_TODAY_TITLE,
  type MovingTodayPayload,
  type MovingTodaySale,
  type MovingTodayWindow,
} from "./types";

const NEW_YORK = "America/New_York";

/** Fewer than this many earlier sales, and the percent is not shown. */
export const HONEST_MIN_COMPARISON_SALES = 3;

/** Earlier sales inside this many days count toward the recent average. */
export const RECENT_AVERAGE_DAYS = 90;

/** Absolute rounded percent that counts as a big move. */
export const BIG_MOVE_PERCENT = 20;

/** A single day stays on its own only when it can show this many rows. */
export const MOVING_TODAY_MIN_DAY_ROWS = 5;

/** Thin days widen to this many New York calendar dates, including today. */
export const MOVING_TODAY_WEEK_DAYS = 7;

/** A thin week widens to this many New York calendar dates, including today. */
export const MOVING_MONTH_DAYS = 30;

export type MovingStripMode = "all-public" | "movers-only";

/** "all-public": movers first, then every public card newest first (small app).
 *  "movers-only": real movers only (flip when the app is bigger). */
export const MOVING_STRIP_MODE: "all-public" | "movers-only" = "all-public";
export const MOVING_RAIL_MAX = 12;
export const MOVING_FULL_ROW = 6;       // movers needed to stay on a narrow window
export const MOVING_FRESH_DAYS = 14;    // "New" chip
export const MOVING_PUBLIC_CAP = 300;   // max public cards read for the strip

/** "Moving today" needs this many cards with a real percent from today's comps. */
export const MOVING_TODAY_MIN_DAY_MOVERS = MOVING_FULL_ROW;

/** Hard cap on movers in one payload. */
export const MOVERS_CAP = 60;

/** Sales under $5 drop out when enough other rows remain. */
export const MOVING_TODAY_MIN_LEAD_CENTS = 500;

export const MOVING_THIS_WEEK_TITLE = "Moving this week";
export const MOVING_THIS_MONTH_TITLE = "Moving this month";
export const MOVING_FRESH_TITLE = "Fresh on Slabhold";
export const MOVING_MONTH_LABEL = "Last 30 days";

export const BIGGEST_SALE_COUNT = 3;
export const BIG_MOVE_COUNT = 3;

const USERNAME = /^[a-z0-9_]{3,20}$/;

export type SaleRecord = {
  queryKey: string;
  cardId: string;
  itemId: string;
  priceCents: number;
  soldOn: string;
};

export type NotableSale = SaleRecord & {
  percent: number | null;
};

export function calendarDateInTimeZone(now: Date, timeZone = NEW_YORK): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/**
 * New York calendar date, bounded as UTC midnights.
 * sold_at stores the sale date at 00:00 UTC, so a New York midnight window
 * would drop every stored sale.
 */
export function newYorkDayWindow(now: Date = new Date()): {
  date: string;
  startIso: string;
  endIso: string;
} {
  const date = calendarDateInTimeZone(now);
  return {
    date,
    startIso: `${date}T00:00:00Z`,
    endIso: `${addCalendarDays(date, 1)}T00:00:00Z`,
  };
}

/** First 10 characters. Date strings and midnight-UTC timestamps share a calendar date. */
export function saleCalendarDate(value: string): string | null {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** True when `shownDate` is today or within `days` calendar days before it. */
export function movingDayIsRecent(
  shownDate: string,
  today: string,
  days = MOVING_TODAY_WEEK_DAYS - 1,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shownDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  if (shownDate > today) return false;
  return shownDate >= addCalendarDays(today, -days);
}

export type MoverWindow = "day" | "week" | "month";

/**
 * Week when it fills a row, else the month when that does. Below a full row
 * either way, the narrower window unless the month adds movers.
 */
export function pickMoverWindow(counts: { week: number; month: number }): "week" | "month" {
  if (counts.week >= MOVING_FULL_ROW) return "week";
  if (counts.month >= MOVING_FULL_ROW) return "month";
  return counts.month > counts.week ? "month" : "week";
}

/** Title and date line for a window ending on `asOf`. */
export function movingWindowHeading(
  window: MovingTodayWindow,
  asOf: string,
): { title: string; dateLabel: string } {
  if (window === "day") return { title: MOVING_TODAY_TITLE, dateLabel: formatSaleDate(asOf) };
  if (window === "week") return { title: MOVING_THIS_WEEK_TITLE, dateLabel: weekDateLabel(asOf) };
  if (window === "month") return { title: MOVING_THIS_MONTH_TITLE, dateLabel: MOVING_MONTH_LABEL };
  return { title: MOVING_FRESH_TITLE, dateLabel: "" };
}

/** Newest added first. Tiles with no add time keep their order at the end. */
export function newestFirst<T extends { addedAt?: string }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, at: row.addedAt ? Date.parse(row.addedAt) : Number.NaN }))
    .sort((a, b) => {
      const aKnown = Number.isFinite(a.at);
      const bKnown = Number.isFinite(b.at);
      if (aKnown && bKnown && a.at !== b.at) return b.at - a.at;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** A mover shown as a plain card: the price stays, the percent never does. */
export function asCardTile(sale: MovingTodaySale): MovingTodaySale {
  return { ...sale, kind: "card", percent: null, percentLabel: null };
}

/** Movers, then cards. Fresh when there are cards but no movers. Empty with neither. */
export function buildMovingPayload(input: {
  asOf: string;
  window: MoverWindow;
  movers: readonly MovingTodaySale[];
  cards: readonly MovingTodaySale[];
  updatedAt?: string;
}): MovingTodayPayload {
  const updatedAt = input.updatedAt ? { updatedAt: input.updatedAt } : {};
  const sales = [...input.movers, ...input.cards];
  if (sales.length === 0) return { ...emptyMovingToday(input.asOf), ...updatedAt };
  const window: MovingTodayWindow = input.movers.length > 0 ? input.window : "fresh";
  return {
    ...movingWindowHeading(window, input.asOf),
    date: input.asOf,
    sales,
    window,
    moverCount: input.movers.length,
    totalCount: sales.length,
    ...updatedAt,
  };
}

/**
 * Heading from the sale dates and the current New York date. Cached title
 * text is ignored. A day list stays "Moving today" only while it is today's
 * and still has a full row. Otherwise it falls back to the week or the
 * month. Movers that fall out of the window join the card section as plain
 * cards, newest first, so a non-empty list never empties. Movers-only mode
 * drops them instead.
 */
export function freshenMovingToday(
  payload: MovingTodayPayload,
  now: Date = new Date(),
  mode: MovingStripMode = MOVING_STRIP_MODE,
): MovingTodayPayload {
  const today = calendarDateInTimeZone(now);
  const tiles = Array.isArray(payload.sales) ? payload.sales : [];
  const movers = rankMovers(tiles.filter((sale) => sale.kind === "mover"));
  const cards = mode === "all-public" ? tiles.filter((sale) => sale.kind === "card") : [];
  const since = (days: number) =>
    movers.filter((sale) => {
      const soldOn = sale.soldOn ?? "";
      return soldOn >= addCalendarDays(today, -(days - 1)) && soldOn <= today;
    });

  let window: MoverWindow;
  let shown: MovingTodaySale[];
  const day = movers.filter((sale) => sale.soldOn === today);
  if (payload.window === "day" && payload.date === today && day.length >= MOVING_FULL_ROW) {
    window = "day";
    shown = day;
  } else {
    const week = since(MOVING_TODAY_WEEK_DAYS);
    const month = since(MOVING_MONTH_DAYS);
    window = pickMoverWindow({ week: week.length, month: month.length });
    shown = window === "week" ? week : month;
  }
  const kept = new Set(shown.map((sale) => sale.cardId));
  const demoted =
    mode === "all-public" ? movers.filter((sale) => !kept.has(sale.cardId)).map(asCardTile) : [];
  return buildMovingPayload({
    asOf: today,
    window,
    movers: shown,
    cards: demoted.length > 0 ? newestFirst([...cards, ...demoted]) : cards,
    updatedAt: payload.updatedAt,
  });
}

/** Inclusive label for the 7-day window ending on `asOf`, as calendar dates. */
export function weekDateLabel(asOf: string): string {
  const start = formatSaleDate(addCalendarDays(asOf, -(MOVING_TODAY_WEEK_DAYS - 1)));
  const end = formatSaleDate(asOf);
  if (!start || !end) return "";
  return start === end ? start : `${start} – ${end}`;
}

/** Page description. The heading stays in the title, not jammed into this sentence. */
export function movingTodayDescription(title: string): string {
  if (title === "Moving yesterday") return "Yesterday's notable sales across the Slabhold catalog.";
  if (title === "Moving today") return "Today's notable sales across the Slabhold catalog.";
  if (title === MOVING_THIS_WEEK_TITLE) return "This week's notable sales across the Slabhold catalog.";
  if (title === MOVING_THIS_MONTH_TITLE) return "This month's notable sales, then the newest cards on Slabhold.";
  if (title === MOVING_FRESH_TITLE) return "The newest cards on Slabhold.";
  const day = title.replace(/^Moving\s+/, "");
  if (day && day !== title) return `Notable sales from ${day} across the Slabhold catalog.`;
  return "Notable sales across the Slabhold catalog.";
}

/** Honest heading. A fallback day is not labeled as today. */
export function movingDayHeading(shownDate: string, today: string): string {
  if (shownDate === today) return "Moving today";
  if (shownDate === addCalendarDays(today, -1)) return "Moving yesterday";
  const label = formatSaleDate(shownDate);
  return label ? `Moving ${label}` : "Moving today";
}

export function dropOwnerFlaggedSales<T extends { cardId: string; itemId: string }>(
  sales: readonly T[],
  owners: readonly { id: string; userId: string }[],
  flags: readonly { cardId: string; userId: string; itemId: string }[],
): T[] {
  const ownerByCard = new Map<string, string>();
  for (const owner of owners) {
    if (owner.id && owner.userId) ownerByCard.set(owner.id, owner.userId);
  }
  const blocked = new Set<string>();
  for (const flag of flags) {
    if (!flag.cardId || !flag.itemId || !flag.userId) continue;
    if (ownerByCard.get(flag.cardId) !== flag.userId) continue;
    blocked.add(`${flag.cardId}\0${flag.itemId}`);
  }
  return sales.filter((sale) => !blocked.has(`${sale.cardId}\0${sale.itemId}`));
}

export function formatSaleDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatMovePercent(percent: number | null): string | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  const rounded = Math.round(percent);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `−${Math.abs(rounded)}%`;
  return "0%";
}

export function publicCardHref(username: string, cardId: string): string | null {
  const handle = username.trim().replace(/^@/, "").toLowerCase();
  if (!USERNAME.test(handle) || !isUuid(cardId)) return null;
  return `${userHref(handle)}/cards/${cardId}`;
}

/** True when `soldOn` is strictly before `today` and inside the recent window. */
export function isWithinRecentWindow(
  soldOn: string,
  today: string,
  days = RECENT_AVERAGE_DAYS,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldOn) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  if (soldOn >= today) return false;
  return soldOn >= addCalendarDays(today, -days);
}

/**
 * Mean of earlier sales for the same card. Null when fewer than
 * HONEST_MIN_COMPARISON_SALES positive prices exist, so a thin sample
 * is not shown as a percent.
 */
export function percentVersusRecentAverage(
  priceCents: number,
  comparisonPricesCents: readonly number[],
): number | null {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  const prices = comparisonPricesCents.filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length < HONEST_MIN_COMPARISON_SALES) return null;
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  if (!Number.isFinite(average) || average <= 0) return null;
  const percent = ((priceCents - average) / average) * 100;
  if (!Number.isFinite(percent)) return null;
  return Math.round(percent);
}

export function comparisonPricesCents(
  sale: Pick<SaleRecord, "queryKey" | "itemId">,
  history: readonly SaleRecord[],
  today: string,
): number[] {
  const byItem = new Map<string, { soldOn: string; priceCents: number }>();
  for (const row of history) {
    if (row.queryKey !== sale.queryKey) continue;
    if (!row.itemId || row.itemId === sale.itemId || row.itemId === "__empty__") continue;
    if (!(row.priceCents > 0) || !Number.isFinite(row.priceCents)) continue;
    if (!isWithinRecentWindow(row.soldOn, today)) continue;
    const prev = byItem.get(row.itemId);
    if (!prev || row.soldOn < prev.soldOn) {
      byItem.set(row.itemId, { soldOn: row.soldOn, priceCents: row.priceCents });
    }
  }
  return [...byItem.values()].map((row) => row.priceCents);
}

function byPrice(a: NotableSale, b: NotableSale): number {
  if (a.priceCents !== b.priceCents) return b.priceCents - a.priceCents;
  const aMove = a.percent == null ? -1 : Math.abs(a.percent);
  const bMove = b.percent == null ? -1 : Math.abs(b.percent);
  if (aMove !== bMove) return bMove - aMove;
  return a.queryKey.localeCompare(b.queryKey) || a.itemId.localeCompare(b.itemId);
}

type PricedRow = {
  priceCents: number | null;
  percent: number | null;
  queryKey?: string;
  itemId?: string;
  cardId?: string;
};

function rowIdentity(row: PricedRow): string {
  return `${row.queryKey ?? row.cardId ?? ""}|${row.itemId ?? ""}|${row.priceCents ?? ""}`;
}

function pricedSort(a: PricedRow, b: PricedRow): number {
  if (a.priceCents !== b.priceCents) return (b.priceCents ?? 0) - (a.priceCents ?? 0);
  const aMove = a.percent == null ? -1 : Math.abs(a.percent);
  const bMove = b.percent == null ? -1 : Math.abs(b.percent);
  if (aMove !== bMove) return bMove - aMove;
  return rowIdentity(a).localeCompare(rowIdentity(b));
}

/** One row per card, best first, using the same order as the display cap. */
export function bestRowPerCard<T extends PricedRow & { cardId: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of [...rows].sort(pricedSort)) {
    if (!row.cardId || seen.has(row.cardId)) continue;
    seen.add(row.cardId);
    kept.push(row);
  }
  return kept;
}

/** A card that moved: a real comp-based percent, not null and not flat. */
export function isMover(row: { percent: number | null }): boolean {
  return row.percent != null && Number.isFinite(row.percent) && row.percent !== 0;
}

function byMove(a: PricedRow, b: PricedRow): number {
  const aMove = Math.abs(a.percent ?? 0);
  const bMove = Math.abs(b.percent ?? 0);
  if (aMove !== bMove) return bMove - aMove;
  return pricedSort(a, b);
}

/** Every mover, one row per card, biggest move first, up to MOVERS_CAP. */
export function rankMovers<T extends PricedRow & { cardId: string }>(rows: readonly T[]): T[] {
  return bestRowPerCard(rows.filter(isMover)).sort(byMove).slice(0, MOVERS_CAP);
}

/** Up is biggest gain first. Down is the biggest drop first. */
export function splitMovers<T extends { percent: number | null }>(
  rows: readonly T[],
): { up: T[]; down: T[] } {
  const up = rows.filter((row) => (row.percent ?? 0) > 0).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  const down = rows.filter((row) => (row.percent ?? 0) < 0).sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
  return { up, down };
}

/**
 * Biggest prices, then big moves, then any remaining rows up to five.
 * A private sale dropped before this cap does not take a visible slot.
 */
export function capNotableSales<T extends PricedRow>(rows: readonly T[]): T[] {
  const biggest = [...rows].sort(pricedSort).slice(0, BIGGEST_SALE_COUNT);
  const picked = new Set(biggest);
  const movers = [...rows]
    .filter((row) => !picked.has(row) && row.percent != null && Math.abs(row.percent) >= BIG_MOVE_PERCENT)
    .sort((a, b) => {
      const aMove = a.percent == null ? -1 : Math.abs(a.percent);
      const bMove = b.percent == null ? -1 : Math.abs(b.percent);
      if (aMove !== bMove) return bMove - aMove;
      return pricedSort(a, b);
    })
    .slice(0, BIG_MOVE_COUNT);
  for (const row of movers) picked.add(row);
  const ranked = [...biggest, ...movers];
  if (ranked.length >= MOVING_TODAY_MIN_DAY_ROWS) return ranked;
  const filler = [...rows].filter((row) => !picked.has(row)).sort(pricedSort);
  return [...ranked, ...filler].slice(0, MOVING_TODAY_MIN_DAY_ROWS);
}

/**
 * Every notable sale in the range, one per card. The display cap is applied
 * after a sale is known to open a public card.
 */
export function orderedNotableSales(input: {
  today: string;
  sales: readonly SaleRecord[];
  history: readonly SaleRecord[];
  from?: string;
  to?: string;
}): NotableSale[] {
  const from = input.from ?? input.today;
  const to = input.to ?? input.today;
  const annotated: NotableSale[] = [];
  for (const sale of input.sales) {
    if (sale.soldOn < from || sale.soldOn > to) continue;
    if (!sale.queryKey || !sale.itemId || sale.itemId === "__empty__") continue;
    if (!(sale.priceCents > 0) || !Number.isFinite(sale.priceCents)) continue;
    const percent = percentVersusRecentAverage(
      sale.priceCents,
      comparisonPricesCents(sale, input.history, sale.soldOn),
    );
    annotated.push({ ...sale, percent });
  }

  const byKey = new Map<string, NotableSale>();
  for (const sale of annotated) {
    const prev = byKey.get(sale.queryKey);
    if (!prev || byPrice(sale, prev) < 0) byKey.set(sale.queryKey, sale);
  }
  return [...byKey.values()];
}

/**
 * Notable sales in a date range: the biggest prices, then other big moves
 * versus the card's recent average. One row per card. The list fills out to
 * five rows when more cards exist, so a full day is not only the top three.
 */
export function rankNotableSales(input: {
  today: string;
  sales: readonly SaleRecord[];
  history: readonly SaleRecord[];
  from?: string;
  to?: string;
}): NotableSale[] {
  return capNotableSales(orderedNotableSales(input));
}

export function toSaleRecord(input: {
  queryKey: string;
  cardId: string;
  itemId: string;
  price: number;
  soldAt: string;
}): SaleRecord | null {
  const soldOn = saleCalendarDate(input.soldAt);
  const priceCents = dollarsToCents(input.price);
  if (!soldOn || !Number.isInteger(priceCents) || priceCents <= 0) return null;
  if (!input.queryKey || !input.itemId || input.itemId === "__empty__") return null;
  return {
    queryKey: input.queryKey,
    cardId: input.cardId,
    itemId: input.itemId,
    priceCents,
    soldOn,
  };
}
