import { canonicalParallelName } from "@/lib/cards/parallels";
import type { SportsCard } from "./types";

/** Shared display format for card pages, collection, Home, and share previews. */
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Always `$35.00` style (two decimal places).
 * The second argument is ignored and kept for call-site compatibility.
 */
export function money(value: number, exact = true) {
  void exact;
  return usd.format(value);
}

/** True when the owner recorded a positive purchase price. */
export function hasPaid(
  value:
    | number
    | null
    | undefined
    | { purchasePrice?: number | null },
): boolean {
  const paid =
    typeof value === "object" && value != null
      ? value.purchasePrice
      : value;
  return paid != null && paid > 0;
}

/** Paid amount for tiles and card page — empty/null/zero shows an em dash. */
export function formatPaidLabel(
  purchasePrice: number | null | undefined,
  exact = false,
) {
  return hasPaid(purchasePrice) ? money(purchasePrice as number, exact) : "—";
}

export function signedMoney(value: number, exact = false) {
  const formatted = money(Math.abs(value), exact);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function cardTitle(
  card: Pick<SportsCard, "year" | "setBrand"> & { yearLabel?: string },
) {
  const year = (card.yearLabel ?? "").trim() || String(card.year);
  return `${year} ${card.setBrand}`;
}

export function cardSubtitle(
  card: Pick<SportsCard, "cardNumber" | "sport" | "grade" | "parallel"> & {
    setBrand?: string;
  },
) {
  const number = card.cardNumber.trim();
  const parallel = canonicalParallelName(card.setBrand ?? "", card.parallel);
  const parts = [
    number && number !== "—" ? `#${number}` : "",
    parallel,
    card.grade.trim(),
    card.sport,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function isSold(card: SportsCard) {
  return card.sellPrice != null && card.sellDate != null;
}

export function currentValue(card: SportsCard) {
  return isSold(card) ? card.sellPrice! : card.estimatedSellPrice;
}

export function profit(card: SportsCard) {
  if (!hasPaid(card)) return 0;
  return currentValue(card) - (card.purchasePrice as number);
}

export function profitPct(card: SportsCard) {
  if (!hasPaid(card)) return 0;
  return profit(card) / (card.purchasePrice as number);
}

export function pct(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)}%`;
}

function parseStamp(iso: string | null | undefined) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return then;
}

/** Product clock. Server UTC and a browser in another zone must format the same text. */
const STAMP_TIME_ZONE = "America/New_York";

function zonedYmd(date: Date): { y: number; m: number; d: number } | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STAMP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const y = value("year");
  const m = value("month");
  const d = value("day");
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function calendarDate(then: Date, now: Date) {
  const thenParts = zonedYmd(then);
  const nowParts = zonedYmd(now);
  if (!thenParts) return "";
  const includeYear = !nowParts || thenParts.y !== nowParts.y;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: STAMP_TIME_ZONE,
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

function calendarDaysBetween(then: Date, now: Date) {
  const start = zonedYmd(then);
  const end = zonedYmd(now);
  if (!start || !end) return 0;
  const startUtc = Date.UTC(start.y, start.m - 1, start.d);
  const endUtc = Date.UTC(end.y, end.m - 1, end.d);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function exactTime(iso: string | null | undefined) {
  const then = parseStamp(iso);
  if (!then) return "";
  return then.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: STAMP_TIME_ZONE,
  });
}

export function timeAgo(iso: string | null | undefined, now = new Date()) {
  const then = parseStamp(iso);
  if (!then) return "";
  const delta = now.getTime() - then.getTime();
  if (delta < 0) return calendarDate(then, now);

  const dayDiff = calendarDaysBetween(then, now);
  if (dayDiff <= 0) {
    if (delta < 60_000) return "Just now";
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.max(1, Math.floor(minutes / 60))}h`;
  }
  if (dayDiff === 1) return "Yesterday";
  const elapsedDays = Math.floor(delta / 86_400_000);
  if (elapsedDays >= 1 && elapsedDays < 7) return `${elapsedDays}d`;
  if (dayDiff < 7) return `${dayDiff}d`;
  return calendarDate(then, now);
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
