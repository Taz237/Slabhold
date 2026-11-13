import { onlyParallelAtRun, type ProductRecord } from "@/lib/cards/product-data";
import { gradesMatchCard, isRawCard, parseGradeFromTitle, titleMatchesCard } from "@/lib/comps/match";
import { sharedCompValue } from "@/lib/comps/shared-value";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { toMatchCard, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { CardValueSale } from "@/lib/value/types";
import { summarizeSales, type ScanCompResult } from "./comp";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import type { SoldTitle } from "./match";
import { asTrawlResults, titleParallel } from "./scan-sales";
import { cleanCompFor } from "./clean-sales";

/** The saved listings answered, with no clean sale: not a failure. */
class SkipSaved extends Error {}

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
) => Promise<{ comps: QuickCompCachedSale[]; fetchedAt: string | null; sample?: boolean } | null>;

export type QuickCompCachedSale = { soldPrice: number; soldDate: string; title?: string };

/**
 * Quick Comp's cached sales for Base keep only titles that are Base: a cache filled before the
 * scan grouped by parallel can hold Fuchsia /299 sales under Base, and those never price as Base.
 */
export function cachedSalesFor(
  identity: Pick<QuickCompIdentity, "parallel">,
  comps: readonly QuickCompCachedSale[],
  directory: readonly IndexedDirectoryPlayer[] | undefined,
): QuickCompCachedSale[] {
  if (!directory || (identity.parallel || "Base").toLowerCase() !== "base") return [...comps];
  return comps.filter((comp) => !comp.title || titleParallel(comp.title, directory) === "Base");
}

export type ScanCompDeps = {
  /** A read that returns null on a miss instead of fetching. */
  quickCompCache: QuickCompCacheRead;
  /** Exact-identity stored sales from public copies (lib/value/price-context.ts). */
  collectionSales: (identity: QuickCompIdentity, viewerId: string) => Promise<CardValueSale[]>;
  /** Cached sold listings whose titles name the player. Filtered to this card here. */
  soldCache?: (playerName: string) => Promise<SoldTitle[]>;
  /** A live eBay search this scan already ran, from the shared cache. Never Trawl. */
  liveCache?: (query: string) => Promise<TrawlSoldResult[] | null>;
  /** The player directory, so a re-filtered live search groups sales by parallel like the scan did. */
  directory?: readonly IndexedDirectoryPlayer[];
  /** The checklist files, to tell when the print run alone names the parallel (the only one at that run). */
  products?: () => Promise<readonly ProductRecord[]>;
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
  // The only parallel at this run: the run's clear majority of sales is this card, whatever the titles call it.
  let runPicked = false;
  if (deps.products && options.serialRun) {
    try {
      runPicked = onlyParallelAtRun(await deps.products(), identity, options.serialRun);
    } catch {
      runPicked = false;
    }
  }

  try {
    const cached = await deps.quickCompCache(identity);
    if (cached && !cached.sample && cached.comps.length > 0 && deps.directory) {
      // The scan's own filter, so this list matches what the scan showed for the same card.
      const results = asTrawlResults(cached.comps.filter((comp) => comp.title).map((comp) => ({ title: comp.title!, price: comp.soldPrice, soldAt: comp.soldDate })));
      const result = cleanCompFor(identity, results, deps.directory, { runPicked, serialRun: options.serialRun, asOf: cached.fetchedAt, source: "quick-comp" });
      if (result.status === "ok") return result;
    }
    const comps = cached && !deps.directory ? cachedSalesFor(identity, cached.comps, deps.directory) : [];
    if (cached && !cached.sample && comps.length > 0) {
      const result = summarizeSales(
        comps.map((comp) => ({ price: comp.soldPrice, soldAt: comp.soldDate })),
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
        if (deps.directory) {
          const result = cleanCompFor(identity, results, deps.directory, { runPicked, serialRun: options.serialRun, asOf: newestSoldAt(results.map((item) => ({ soldAt: item.date_sold }))), source: "live" });
          return result.status === "ok" ? result : { status: "none", searched: true };
        }
        const sales = liveCardSales(identity, options, results);
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
      const saved = await deps.soldCache(identity.playerName);
      if (deps.directory) {
        const results = asTrawlResults(saved.map((item) => ({ title: item.title, price: Number(item.price), soldAt: item.soldAt ?? null })));
        const result = cleanCompFor(identity, results, deps.directory, { runPicked, serialRun: options.serialRun, asOf: newestSoldAt(saved.map((item) => ({ soldAt: item.soldAt ?? null }))), source: "sold-cache" });
        if (result.status === "ok") return result;
        throw new SkipSaved();
      }
      const sales = salesForCard(saved, identity, options);
      const result = summarizeSales(sales, { asOf: newestSoldAt(sales), source: "sold-cache" });
      if (result.status === "ok") return result;
    } catch (error) {
      if (!(error instanceof SkipSaved)) failures += 1;
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

/** Without the directory: the card-page title rules. */
function liveCardSales(identity: QuickCompIdentity, options: ScanCompOptions, results: readonly TrawlSoldResult[]) {
  const card = { ...toMatchCard(identity), serialRun: options.serialRun ?? null };
  return sharedCompValue(card, [...results]).sales.map((sale) => ({ price: sale.price, soldAt: sale.soldAt }));
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
