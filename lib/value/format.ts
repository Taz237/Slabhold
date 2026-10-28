import { money } from "@/lib/format";
import { singleSaleTrusted, type PremiumCardFields } from "@/lib/value/price-fallback";
import type { CardValueResult } from "./types";

/** Shown instead of a dollar amount when no matching sales were kept. */
export const NOT_ENOUGH_SALES_LABEL = "Not enough sales yet";

/** Full status when comps are rate-limited or the request fails. */
export const VALUE_UNAVAILABLE_LABEL = "Value unavailable right now";

/**
 * Est. sell tile copy. The long unavailable sentence overflows the tile
 * at phone and desktop widths, so the tile shows a short label and keeps
 * the full sentence as the tooltip.
 */
export function estSellTileCopy(label: string | null | undefined): {
  text: string;
  title?: string;
} {
  const full = label?.trim() ? label : NOT_ENOUGH_SALES_LABEL;
  if (full === VALUE_UNAVAILABLE_LABEL) {
    return { text: "Unavailable", title: VALUE_UNAVAILABLE_LABEL };
  }
  return { text: full };
}

/** Fresh cards without a card_values row show "Value updating" this long. */
export const VALUE_UPDATING_WINDOW_MS = 10 * 60 * 1000;

export type FormatCardValueLabelOptions = {
  /** Card createdAt — used when there is no card_values row. */
  createdAt?: string | null;
  now?: number | Date;
};

function ageMs(
  createdAt: string | null | undefined,
  now: number | Date | undefined,
): number | null {
  if (!createdAt) return null;
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return null;
  const nowMs =
    typeof now === "number" ? now : now instanceof Date ? now.getTime() : Date.now();
  return nowMs - then;
}

/**
 * Shared status / amount label for collection tiles and the card page.
 * "Value updating" only when there is no card_values row and the card is
 * younger than 10 minutes; otherwise missing → "Not enough sales yet".
 */
export function formatCardValueLabel(
  value: CardValueResult | null | undefined,
  options?: FormatCardValueLabelOptions,
): string {
  if (value) {
    if (value.status === "no_sales") return NOT_ENOUGH_SALES_LABEL;
    if (value.status === "unavailable") return VALUE_UNAVAILABLE_LABEL;
    if (value.status === "sample" || value.status === "ok") {
      return marketValueAmount(value) ?? NOT_ENOUGH_SALES_LABEL;
    }
    if (value.status === "stale") {
      return VALUE_UNAVAILABLE_LABEL;
    }
    const amount = marketValueAmount(value);
    if (amount) return amount;
  }

  const age = ageMs(options?.createdAt, options?.now);
  if (age != null && age < VALUE_UPDATING_WINDOW_MS) {
    return "Value updating";
  }
  return NOT_ENOUGH_SALES_LABEL;
}

/**
 * Dollar amount the card page shows for a comps value.
 * Null when there is no median backed by at least one sale.
 */
export function marketValueAmount(
  value: CardValueResult | null | undefined,
): string | null {
  if (!cardValueHasAmount(value)) return null;
  return money(value.median);
}

/**
 * Read-only line for the edit form and the card page.
 * "Current value $355.00 · 42 sales"
 */
export function marketValueSummary(
  value: CardValueResult | null | undefined,
): string | null {
  const amount = marketValueAmount(value);
  if (!amount || !value) return null;
  const sales = value.nSales === 1 ? "sale" : "sales";
  return `Current value ${amount} · ${value.nSales} ${sales}`;
}

export function cardValueHasAmount(
  value: CardValueResult | null | undefined,
): value is CardValueResult & { median: number } {
  return (
    value != null &&
    value.median != null &&
    value.nSales >= 1 &&
    (value.status === "ok" || value.status === "sample")
  );
}

/**
 * The dollar amount a screen may show for a card. Null when there is no
 * amount, or when one cheap sale is all that backs a premium card's price.
 */
export function shownCardValue(
  card: PremiumCardFields | null | undefined,
  value: CardValueResult | null | undefined,
): number | null {
  if (!cardValueHasAmount(value)) return null;
  if (!singleSaleTrusted(card, value)) return null;
  return value.median;
}

export function isLowConfidenceValue(
  value: CardValueResult | null | undefined,
): boolean {
  if (!value) return false;
  if (value.status === "no_sales") return false;
  if (value.status !== "ok" && value.status !== "sample") return false;
  return value.nSales > 0 && value.nSales < 5;
}
