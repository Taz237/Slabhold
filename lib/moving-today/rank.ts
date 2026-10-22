import { dollarsToCents } from "@/lib/comps/stats";
import { isUuid } from "@/lib/value/card-value-access";

const NEW_YORK = "America/New_York";

/** Fewer than this many earlier sales, and the percent is not shown. */
export const HONEST_MIN_COMPARISON_SALES = 3;

/** Earlier sales inside this many days count toward the recent average. */
export const RECENT_AVERAGE_DAYS = 90;

/** Absolute rounded percent that counts as a big move. */
export const BIG_MOVE_PERCENT = 20;

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

function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const bag: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const hour = bag.hour === "24" ? 0 : Number(bag.hour);
  const asUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    hour,
    Number(bag.minute),
    Number(bag.second),
  );
  return asUtc - instant.getTime();
}

/** UTC instant of midnight on a calendar date in America/New_York. */
export function zonedDayStart(date: string, timeZone = NEW_YORK): Date {
  const guess = new Date(`${date}T00:00:00.000Z`);
  const offset = timeZoneOffsetMs(timeZone, guess);
  let start = new Date(guess.getTime() - offset);
  if (calendarDateInTimeZone(start, timeZone) !== date) {
    start = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, start));
  }
  return start;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function newYorkDayWindow(now: Date = new Date()): {
  date: string;
  startIso: string;
  endIso: string;
} {
  const date = calendarDateInTimeZone(now);
  const start = zonedDayStart(date);
  const end = zonedDayStart(addCalendarDays(date, 1));
  return { date, startIso: start.toISOString(), endIso: end.toISOString() };
}

export function soldOnInNewYork(soldAt: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(soldAt)) return soldAt;
  const parsed = new Date(soldAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return calendarDateInTimeZone(parsed);
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
  return `/u/${handle}/cards/${cardId}`;
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

function byMove(a: NotableSale, b: NotableSale): number {
  const aMove = a.percent == null ? -1 : Math.abs(a.percent);
  const bMove = b.percent == null ? -1 : Math.abs(b.percent);
  if (aMove !== bMove) return bMove - aMove;
  return byPrice(a, b);
}

function isBigMove(sale: NotableSale): boolean {
  return sale.percent != null && Math.abs(sale.percent) >= BIG_MOVE_PERCENT;
}

/**
 * Today's notable sales: the biggest prices, then other big moves versus
 * the card's recent average. One row per card. The same card is not repeated.
 */
export function rankNotableSales(input: {
  today: string;
  sales: readonly SaleRecord[];
  history: readonly SaleRecord[];
}): NotableSale[] {
  const annotated: NotableSale[] = [];
  for (const sale of input.sales) {
    if (sale.soldOn !== input.today) continue;
    if (!sale.queryKey || !sale.itemId || sale.itemId === "__empty__") continue;
    if (!(sale.priceCents > 0) || !Number.isFinite(sale.priceCents)) continue;
    const percent = percentVersusRecentAverage(
      sale.priceCents,
      comparisonPricesCents(sale, input.history, input.today),
    );
    annotated.push({ ...sale, percent });
  }

  const byKey = new Map<string, NotableSale>();
  for (const sale of annotated) {
    const prev = byKey.get(sale.queryKey);
    if (!prev || byPrice(sale, prev) < 0) byKey.set(sale.queryKey, sale);
  }
  const unique = [...byKey.values()];
  const biggest = [...unique].sort(byPrice).slice(0, BIGGEST_SALE_COUNT);
  const picked = new Set(biggest.map((sale) => sale.queryKey));
  const movers = unique
    .filter((sale) => !picked.has(sale.queryKey) && isBigMove(sale))
    .sort(byMove)
    .slice(0, BIG_MOVE_COUNT);
  return [...biggest, ...movers];
}

export function toSaleRecord(input: {
  queryKey: string;
  cardId: string;
  itemId: string;
  price: number;
  soldAt: string;
}): SaleRecord | null {
  const soldOn = soldOnInNewYork(input.soldAt);
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
