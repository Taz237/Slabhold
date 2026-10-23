import type { CardValueResult } from "@/lib/value/types";
import { saleSourceIsSelfReported } from "./self-reported";

/** Fields stored beside the median. A null sale count is not a trusted price. */
export function cardValueSnapshotFields(
  value: CardValueResult | null | undefined,
  saleSource?: string | null,
): { median: number | null; n_sales: number | null; self_reported: boolean } {
  const median =
    value && typeof value.median === "number" && Number.isFinite(value.median) ? value.median : null;
  const nSales =
    value && typeof value.nSales === "number" && Number.isFinite(value.nSales)
      ? Math.max(0, Math.round(value.nSales))
      : null;
  return {
    median,
    n_sales: nSales,
    self_reported: saleSourceIsSelfReported(saleSource),
  };
}
