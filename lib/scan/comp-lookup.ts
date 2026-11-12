import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { CardValueSale } from "@/lib/value/types";
import { summarizeSales, type ScanCompResult } from "./comp";

/**
 * Sold prices for a scanned card from caches only. Never calls Trawl and
 * never spends a quick comp cap:
 * 1. quick comp's shared cache for this exact card and grade (someone comped it),
 * 2. stored sales on public copies of the same card in collections.
 * No sales from either is an honest "none", never a price.
 */

export type QuickCompCacheRead = (
  identity: QuickCompIdentity,
) => Promise<{ comps: { soldPrice: number; soldDate: string }[]; fetchedAt: string | null; sample?: boolean } | null>;

export type ScanCompDeps = {
  /** A read that returns null on a miss instead of fetching. */
  quickCompCache: QuickCompCacheRead;
  /** Exact-identity stored sales from public copies (lib/value/price-context.ts). */
  collectionSales: (identity: QuickCompIdentity, viewerId: string) => Promise<CardValueSale[]>;
};

export async function lookupScanComp(
  identity: QuickCompIdentity,
  viewerId: string,
  deps: ScanCompDeps,
): Promise<ScanCompResult> {
  let failures = 0;

  try {
    const cached = await deps.quickCompCache(identity);
    if (cached && !cached.sample && cached.comps.length > 0) {
      const result = summarizeSales(
        cached.comps.map((comp) => ({ price: comp.soldPrice, soldAt: comp.soldDate })),
        { asOf: cached.fetchedAt, source: "quick-comp" },
      );
      if (result.status === "ok") return result;
    }
  } catch {
    failures += 1;
  }

  try {
    const sales = await deps.collectionSales(identity, viewerId);
    const result = summarizeSales(
      sales.filter((sale) => !isSelfReported(sale.source)),
      { asOf: newest(sales), source: "collections" },
    );
    if (result.status === "ok") return result;
  } catch {
    failures += 1;
  }

  return failures === 2 ? { status: "unavailable" } : { status: "none" };
}

/** A collector's own entered price is not a sale anyone can check. */
function isSelfReported(source: string | null | undefined): boolean {
  const value = (source ?? "").trim().toLowerCase();
  return value === "self" || value === "owner" || value === "reported";
}

function newest(sales: readonly CardValueSale[]): string | null {
  let best: string | null = null;
  for (const sale of sales) {
    if (sale.soldAt && (!best || sale.soldAt > best)) best = sale.soldAt;
  }
  return best;
}
