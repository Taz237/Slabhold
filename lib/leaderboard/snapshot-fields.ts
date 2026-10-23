import type { CardValueResult } from "@/lib/value/types";
import { saleSourceIsSelfReported } from "./self-reported";

/**
 * Source stored on the snapshot. A self, owner, or reported sale wins over a
 * marketplace sale so the value board can flag that card.
 */
export function snapshotSaleSource(
  value: { sales?: readonly { source?: string | null }[] | null } | null | undefined,
): string | null {
  let fallback: string | null = null;
  for (const sale of value?.sales ?? []) {
    const source = sale.source?.trim();
    if (!source) continue;
    if (saleSourceIsSelfReported(source)) return source;
    if (!fallback) fallback = source;
  }
  return fallback;
}

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
  const source = saleSource === undefined ? snapshotSaleSource(value) : saleSource;
  return {
    median,
    n_sales: nSales,
    self_reported: saleSourceIsSelfReported(source),
  };
}
