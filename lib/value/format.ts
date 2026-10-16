import { money } from "@/lib/format";
import type { CardValueResult } from "./types";

/** Short label for tiles and metrics. */
export function formatCardValueLabel(
  value: CardValueResult | null | undefined,
): string {
  if (!value) return "Value updating";
  if (value.status === "no_sales") return "No sales yet";
  if (value.status === "sample") {
    return value.median != null ? money(value.median) : "Value updating";
  }
  if (value.status === "ok" && value.median != null) {
    return money(value.median);
  }
  if (
    (value.status === "unavailable" || value.status === "stale") &&
    value.median == null
  ) {
    return "Value updating";
  }
  if (value.status === "unavailable" || value.status === "stale") {
    return "Value updating";
  }
  if (value.median != null) return money(value.median);
  return "Value updating";
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
  return value.nSales < 5;
}
