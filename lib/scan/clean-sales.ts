import type { TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { summarizeSales, type ScanCompResult, type ScanCompSource } from "./comp";
import { groupByParallel, groupFor, guardOutliers, scanSalesFor, unnamedRunLabel, type ParallelGroup, type ScanSale } from "./scan-sales";

/**
 * One way to turn sold listings into a card's price, whichever source they came from (the live
 * search, Quick Comp's cache, saved listings): the scan's filter (player, #, run, year, raw or the
 * picked grade, junk), grouped by parallel, then the outlier guard. Add card and Quick Comp read
 * the same list for the same card, parallel and grade.
 */

/** The group a picked parallel prices from. Open: Base, or a numbered card's run. */
export function wantedGroup(parallel: string, serialRun: number | null | undefined): string {
  const open = !parallel || parallel.toLowerCase() === "base";
  if (open && serialRun) return unnamedRunLabel(serialRun);
  return open ? "Base" : parallel;
}

/** One parallel's sales, outliers out, as a price. Two sales 10x apart show, but aren't a clean last sold. */
export function priceScanGroup(sales: readonly ScanSale[], meta: { asOf: string | null; source: ScanCompSource }): ScanCompResult {
  const guarded = guardOutliers(sales);
  const result = summarizeSales(
    guarded.sales.map((sale) => ({ price: sale.price, soldAt: sale.soldAt })),
    meta,
  );
  return result.status === "ok" && guarded.unclean ? { ...result, unclean: true } : result;
}

/** This card's sales from any source, grouped by parallel. */
export function cleanGroups(
  identity: QuickCompIdentity,
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
  serialRun: number | null | undefined,
): ParallelGroup[] {
  const { kept } = scanSalesFor(
    { playerName: identity.playerName, cardNumber: identity.cardNumber, serialRun: serialRun ?? null, yearLabel: identity.yearLabel },
    { grade: identity.grade, setBrand: identity.setBrand, parallel: identity.parallel },
    results,
    directory,
  );
  return groupByParallel(kept);
}

/** The picked parallel's clean price from any source. "none" when it has no clean sale. */
export function cleanCompFor(
  identity: QuickCompIdentity,
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
  options: { serialRun?: number | null; asOf: string | null; source: ScanCompSource },
): ScanCompResult {
  const group = groupFor(cleanGroups(identity, results, directory, options.serialRun), wantedGroup(identity.parallel, options.serialRun));
  if (!group) return { status: "none" };
  return priceScanGroup(group.sales, { asOf: options.asOf, source: options.source });
}
