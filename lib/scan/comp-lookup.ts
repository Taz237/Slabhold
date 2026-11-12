import { gradesMatchCard, isRawCard, parseGradeFromTitle, titleMatchesCard } from "@/lib/comps/match";
import { sharedCompValue } from "@/lib/comps/shared-value";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { toMatchCard, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { CardValueSale } from "@/lib/value/types";
import { summarizeSales, type ScanCompResult } from "./comp";
import type { SoldTitle } from "./match";

/**
 * Sold prices for a scanned card from caches only. Never calls Trawl and
 * never spends a quick comp cap:
 * 1. quick comp's shared cache for this exact card and grade (someone comped it),
 * 2. cached eBay sold listings (sold_comps_cache) whose titles match this exact
 *    card, checked with the same title rules card pages use,
 * 3. stored sales on public copies of the same card in collections.
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
  /** Cached sold listings whose titles name the player. Filtered to this card here. */
  soldCache?: (playerName: string) => Promise<SoldTitle[]>;
  /** A live eBay search this scan already ran, from the shared cache. Never Trawl. */
  liveCache?: (query: string) => Promise<TrawlSoldResult[] | null>;
};

export type ScanCompOptions = {
  /** The print run the card shows (/199), so numbered listings for it count. */
  serialRun?: number | null;
  /** The live search the scan ran (from /api/scan/solds), so another parallel or grade reuses it. */
  query?: string | null;
};

/**
 * The cached listings that are this exact card: player, year, set, #, parallel,
 * print run, and raw vs graded. A raw card keeps raw sales only; a PSA 9 keeps
 * PSA 9 sales only (from the saved grade, else the title). Never mixed.
 */
export function salesForCard(titles: readonly SoldTitle[], identity: QuickCompIdentity, options: ScanCompOptions = {}) {
  const card = { ...toMatchCard(identity), serialRun: options.serialRun ?? null };
  return titles
    .filter((sale) => {
      if (typeof sale.price !== "number" || !(sale.price > 0)) return false;
      if (!titleMatchesCard(sale.title, card)) return false;
      const fromTitle = parseGradeFromTitle(sale.title);
      const grader = sale.grader?.trim() || fromTitle?.grader || null;
      const grade = sale.grade?.trim() || fromTitle?.grade || null;
      if (isRawCard(card)) return !grader && gradesMatchCard(card, grader, grade, sale.title);
      return gradesMatchCard(card, grader, grade, sale.title);
    })
    .map((sale) => ({ price: sale.price as number, soldAt: sale.soldAt ?? null }));
}

export async function lookupScanComp(
  identity: QuickCompIdentity,
  viewerId: string,
  deps: ScanCompDeps,
  options: ScanCompOptions = {},
): Promise<ScanCompResult> {
  let failures = 0;
  let sources = 2;

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

  // Another parallel or grade on the same scan: the live search already ran, so filter it again.
  if (options.query && deps.liveCache) {
    try {
      const results = await deps.liveCache(options.query);
      if (results) {
        const card = { ...toMatchCard(identity), serialRun: options.serialRun ?? null };
        const sales = sharedCompValue(card, [...results]).sales;
        const result = summarizeSales(
          sales.map((sale) => ({ price: sale.price, soldAt: sale.soldAt })),
          { asOf: newestSoldAt(sales), source: "live" },
        );
        return result.status === "ok" ? result : { status: "none", searched: true };
      }
    } catch {
      // Falls through to the saved sales.
    }
  }

  if (deps.soldCache) {
    sources += 1;
    try {
      const sales = salesForCard(await deps.soldCache(identity.playerName), identity, options);
      const result = summarizeSales(sales, { asOf: newestSoldAt(sales), source: "sold-cache" });
      if (result.status === "ok") return result;
    } catch {
      failures += 1;
    }
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

  return failures === sources ? { status: "unavailable" } : { status: "none" };
}

function newestSoldAt(sales: readonly { soldAt: string | null }[]): string | null {
  let best: string | null = null;
  for (const sale of sales) if (sale.soldAt && (!best || sale.soldAt > best)) best = sale.soldAt;
  return best;
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
