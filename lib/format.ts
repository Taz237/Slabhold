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

/** Card page dates. A card with no purchase date (a bin card) skips "Bought". */
export function cardDatesLine(input: {
  purchaseDate: string | null | undefined;
  sold: boolean;
  soldDate: string | null | undefined;
}): string {
  const parts: string[] = [];
  if (input.purchaseDate) parts.push(`Bought ${formatDate(input.purchaseDate)}`);
  parts.push(input.sold ? `Sold ${formatDate(input.soldDate || null)}` : "Still held");
  return parts.join(" · ");
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

export function isSold(card: Pick<SportsCard, "sellPrice" | "sellDate"> & { soldAt?: string | null }) {
  return Boolean(card.soldAt) || (card.sellPrice != null && card.sellDate != null);
}

export function currentValue(card: SportsCard) {
  if (!isSold(card)) return card.estimatedSellPrice;
  return card.sellPrice ?? 0;
}

export function profit(card: SportsCard) {
  if (!hasPaid(card)) return 0;
  if (isSold(card) && card.sellPrice == null) return 0;
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

function calendarDate(then: Date) {
  const includeYear = then.getFullYear() !== new Date().getFullYear();
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

function calendarDaysBetween(then: Date, now: Date) {
  const start = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - start) / 86_400_000);
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
  });
}

export function timeAgo(iso: string | null | undefined, now = new Date()) {
  const then = parseStamp(iso);
  if (!then) return "";
  const delta = now.getTime() - then.getTime();
  if (delta < 0) return calendarDate(then);

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
  return calendarDate(then);
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
