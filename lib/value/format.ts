import { money } from "@/lib/format";
import type { CardValueResult } from "./types";

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
 * younger than 10 minutes; otherwise missing → "No sales yet".
 */
export function formatCardValueLabel(
  value: CardValueResult | null | undefined,
  options?: FormatCardValueLabelOptions,
): string {
  if (value) {
    if (value.status === "no_sales") return "No sales yet";
    if (value.status === "unavailable") return "Value unavailable right now";
    if (value.status === "sample") {
      return value.median != null ? money(value.median) : "No sales yet";
    }
    if (value.status === "ok" && value.median != null) {
      return money(value.median);
    }
    if (value.status === "stale") {
      if (value.median != null) return money(value.median);
      return "Value unavailable right now";
    }
    if (value.median != null) return money(value.median);
  }

  const age = ageMs(options?.createdAt, options?.now);
  if (age != null && age < VALUE_UPDATING_WINDOW_MS) {
    return "Value updating";
  }
  return "No sales yet";
}

export function cardValueHasAmount(
  value: CardValueResult | null | undefined,
): value is CardValueResult & { median: number } {
  return (
    value != null &&
    value.median != null &&
    (value.status === "ok" || value.status === "sample")
  );
}

export function isLowConfidenceValue(
  value: CardValueResult | null | undefined,
): boolean {
  if (!value) return false;
  if (value.status === "no_sales") return false;
  if (value.status !== "ok" && value.status !== "sample") return false;
  return value.nSales > 0 && value.nSales < 5;
}
