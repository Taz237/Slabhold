import type { CatalogCard } from "@/lib/card-catalog";
import type { ProductRecord } from "@/lib/cards/product-data";
import { sharedCompValue } from "@/lib/comps/shared-value";
import type { CleanedSale, TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { toMatchCard, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { QuickCompLimitReason } from "@/lib/quick-comp/limits";
import { compIdentityFromMatch, scanCompGrade, summarizeSales, type ScanCompResult } from "./comp";
import { cachedSalesFor, salesForCard, type QuickCompCachedSale } from "./comp-lookup";
import {
  liveSearchLadder,
  rankScanMatches,
  scanPlayerName,
  type ScanMatch,
  type SoldTitle,
} from "./match";
import { newLookupBudget, type LookupBudget } from "./live-search";
import { groupByParallel, groupFor, scanSalesFor, type ParallelGroup, type ScanSale, type ScanSalesResult } from "./scan-sales";
import { scanReadFrom, type ScanCapture } from "./session";

/** One rung of the search ladder, for the dev log. Queries carry card names only, never user data. */
export type LadderLog =
  | { rung: number; query: string; ok: true; results: number; kept: number; dropped: ScanSalesResult["dropped"] }
  | { rung: number; query: string; ok: false; reason: string };

/**
 * One scan's last eBay solds. Identify first (what the card prints, plus sold
 * listings we already saved), then:
 *
 * 1. Cache first. When the card is pinned down and Quick Comp's shared cache
 *    or our saved sold listings already have sales for it, those show: no cap
 *    spent, no Trawl.
 * 2. Otherwise one live eBay sold search through Trawl, built from what we
 *    know (a partial identity is fine). It spends Quick Comp's caps (10 a day,
 *    and the shared 5 an hour) only on a miss, right before Trawl. The same
 *    search is shared across collectors for 6 hours.
 * 3. The sold titles help finish the identity (set, #, parallel), like saved
 *    ones do, so a logo-only Mosaic is found.
 * 4. Only sales of this exact card count: player, year, set, #, parallel, print
 *    run, and raw vs graded (a raw card never shows graded sales, a PSA 9 only
 *    PSA 9). They're stored in Quick Comp's shared cache for the next scan.
 *
 * Never a made-up price: no matching sale is an honest "none", a cap is the
 * cap message, a Trawl failure is "unavailable". The identity shows either way.
 */

export type LiveSearchResult =
  | { ok: true; results: TrawlSoldResult[]; fetchedAt: string }
  | { ok: false; reason: QuickCompLimitReason; resetAt: string }
  | { ok: false; reason: "unavailable" };

export type LiveSoldsDeps = {
  directory: readonly IndexedDirectoryPlayer[];
  products: () => Promise<readonly ProductRecord[]>;
  /** Saved sold listings (sold_comps_cache) naming this player. */
  cachedTitles: (player: string) => Promise<SoldTitle[]>;
  /** Quick Comp's shared cache for this exact card and grade. Null on a miss; never fetches. */
  quickCompCache: (identity: QuickCompIdentity) => Promise<{ comps: QuickCompCachedSale[]; fetchedAt: string | null; sample?: boolean } | null>;
  /** One Trawl sold search, shared per query. Spends the caps only on a miss, once per lookup (the budget). */
  liveSearch: (query: string, userId: string, budget?: LookupBudget) => Promise<LiveSearchResult>;
  /** Dev-only trace of each rung: the query, results back, kept, and why the rest were dropped. No user data. */
  log?: (event: LadderLog) => void;
  /** Puts this card's live sales in Quick Comp's shared cache. */
  storeQuickComp: (identity: QuickCompIdentity, sales: CleanedSale[], results: TrawlSoldResult[], meta: { query: string; fetchedAt: string }) => Promise<void>;
};

export type LiveSoldsInput = {
  capture: Pick<ScanCapture, "lines" | "backLines" | "kind" | "border">;
  /** The rows the phone already ranked (catalog cards), so the re-rank keeps them. */
  rows: CatalogCard[];
};

export type LiveSoldsResult = {
  matches: ScanMatch[];
  comp: ScanCompResult;
  /** The live search that ran, so another parallel or grade on the sheet can reuse it. */
  query: string | null;
};

/** Pinned down enough to trust a cached price: the card backed the set and the number (or a slab label did). */
function confident(match: ScanMatch | undefined): match is ScanMatch {
  if (!match) return false;
  return match.sureness.player !== "unsure" && match.sureness.set !== "unsure" && match.sureness.number === "sure";
}

function identityOf(match: ScanMatch): QuickCompIdentity | null {
  return compIdentityFromMatch(match, scanCompGrade(match))?.identity ?? null;
}

async function cachedComp(
  top: ScanMatch,
  identity: QuickCompIdentity,
  titles: readonly SoldTitle[],
  deps: LiveSoldsDeps,
): Promise<ScanCompResult | null> {
  try {
    const cached = await deps.quickCompCache(identity);
    const comps = cached ? cachedSalesFor(identity, cached.comps, deps.directory) : [];
    if (cached && !cached.sample && comps.length > 0) {
      const result = summarizeSales(
        comps.map((comp) => ({ price: comp.soldPrice, soldAt: comp.soldDate })),
        { asOf: cached.fetchedAt, source: "quick-comp" },
      );
      if (result.status === "ok") return result;
    }
  } catch {
    // A failed cache read falls through to the saved listings, then a live search.
  }
  const sales = salesForCard(titles, identity, { serialRun: top.serialRun });
  const result = summarizeSales(sales, { asOf: newest(sales), source: "sold-cache" });
  return result.status === "ok" ? result : null;
}

function newest(sales: readonly { soldAt?: string | null }[]): string | null {
  let best: string | null = null;
  for (const sale of sales) if (sale.soldAt && (!best || sale.soldAt > best)) best = sale.soldAt;
  return best;
}

function liveTitles(results: readonly TrawlSoldResult[]): SoldTitle[] {
  return results
    .filter((result) => typeof result?.title === "string" && result.title.trim())
    .map((result) => ({ title: result.title, price: result.sale_price, soldAt: result.date_sold }));
}

/** This exact card's sales from the live results: the card-page rules, print run and grade included. */
export function liveSalesFor(match: ScanMatch, identity: QuickCompIdentity, results: readonly TrawlSoldResult[]): CleanedSale[] {
  return sharedCompValue({ ...toMatchCard(identity), serialRun: match.serialRun }, [...results]).sales;
}

export async function lookupLiveSolds(
  input: LiveSoldsInput,
  userId: string,
  deps: LiveSoldsDeps,
): Promise<LiveSoldsResult> {
  const read = scanReadFrom({ ...input.capture, image: null }, deps.directory);
  const player = scanPlayerName(read, deps.directory);
  let products: readonly ProductRecord[] | null = null;
  try {
    products = await deps.products();
  } catch {
    products = null;
  }
  const rank = (soldTitles: readonly SoldTitle[]) =>
    rankScanMatches(read, input.rows, { directory: deps.directory, products, soldTitles }).matches;

  // No player read: no search, ever.
  if (!player) return { matches: rank([]), comp: { status: "none" }, query: null };

  let saved: SoldTitle[] = [];
  try {
    saved = await deps.cachedTitles(player);
  } catch {
    saved = [];
  }
  const first = rank(saved);
  const top = first[0];

  // 1. Cache first, only for a card the scan pinned down.
  if (confident(top)) {
    const identity = identityOf(top);
    if (identity) {
      const cached = await cachedComp(top, identity, saved, deps);
      if (cached) return { matches: first, comp: cached, query: null };
    }
  }

  // 2. The search ladder, built from what we know: stop at the first rung that finds this card's sales.
  const ladder = liveSearchLadder(read, top, deps.directory);
  if (ladder.length === 0) return { matches: first, comp: { status: "none" }, query: null };
  const budget = newLookupBudget();
  const results: TrawlSoldResult[] = [];
  let fetchedAt = "";
  let usedQuery: string | null = null;
  let matches = first;
  let found: ScanSalesResult = { kept: [], dropped: emptyDropped() };
  for (const [index, query] of ladder.entries()) {
    const live = await deps.liveSearch(query, userId, budget).catch((): LiveSearchResult => ({ ok: false, reason: "unavailable" }));
    if (!live.ok) {
      deps.log?.({ rung: index, query, ok: false, reason: live.reason });
      // A cap: say so, never "no sales".
      if (live.reason === "daily" || live.reason === "hourly" || live.reason === "safety") {
        return { matches, comp: { status: "limited", reason: live.reason, resetAt: live.resetAt }, query: usedQuery };
      }
      // One failed search never wipes out the others: try the next rung. "Unavailable" only when none answered.
      continue;
    }
    usedQuery = query;
    fetchedAt = live.fetchedAt;
    results.push(...live.results);
    // 3. The sold titles help finish the identity (set, #, parallel).
    matches = rank([...saved, ...liveTitles(results)]);
    const best = matches[0];
    found = best ? scanSalesFor(best, { grade: scanCompGrade(best), setBrand: best.setBrand, parallel: best.parallel }, results, deps.directory) : found;
    deps.log?.({ rung: index, query, ok: true, results: live.results.length, kept: found.kept.length, dropped: found.dropped });
    if (found.kept.length > 0) break;
  }

  if (!usedQuery) return { matches, comp: { status: "unavailable" }, query: null };
  const best = matches[0];
  if (!best) return { matches: first, comp: { status: "none", searched: true }, query: usedQuery };
  if (found.kept.length === 0) return { matches, comp: { status: "none", searched: true }, query: usedQuery };

  // 4. Sales by parallel: the picked parallel's group, labelled. With the parallel open, only a group
  // that's most of the sales (2+) is priced, and the card takes its name; otherwise the groups show.
  const groups = groupByParallel(found.kept);
  const leader = groups[0];
  if (!best.parallel && !isMajority(leader, found.kept.length)) {
    return { matches, comp: { status: "split", groups: groups.map(groupSummary) }, query: usedQuery };
  }
  // A colored group takes the card's parallel chip; a Base majority stays open and prices as Base.
  if (!best.parallel && leader.label !== "Base") matches = [withSalesParallel(best, leader.label), ...matches.slice(1)];
  const group = best.parallel ? groupFor(groups, best.parallel) : leader;
  if (!group) return { matches, comp: { status: "split", groups: groups.map(groupSummary) }, query: usedQuery };
  const comp = summarizeSales(
    group.sales.map((sale) => ({ price: sale.price, soldAt: sale.soldAt })),
    { asOf: fetchedAt || null, source: "live" },
  );
  if (comp.status !== "ok") return { matches, comp: { status: "none", searched: true }, query: usedQuery };

  // Stored for the next scan or Quick Comp only when the parallel was known: an open one would file under Base.
  const identity = identityOf(best);
  if (identity && best.parallel && usedQuery) {
    try {
      await deps.storeQuickComp(identity, group.sales.map(toCleanedSale), results, { query: usedQuery, fetchedAt });
    } catch {
      // The prices still show; the next scan searches again.
    }
  }
  return {
    matches,
    comp: { ...comp, parallel: group.label, groups: groups.map((item) => ({ label: item.label, nSales: item.sales.length })) },
    query: usedQuery,
  };
}

/** Most of the sales (and at least 2) name this parallel. */
function isMajority(group: { sales: readonly unknown[] } | undefined, total: number): group is ParallelGroup {
  return Boolean(group) && group!.sales.length >= 2 && group!.sales.length * 2 > total;
}

/** The card with the parallel most of its sales name, preselected and marked as from sales. */
export function withSalesParallel(match: ScanMatch, label: string): ScanMatch {
  const option = { name: label, serialRun: match.serialRun };
  return {
    ...match,
    parallel: label,
    parallelSource: "sales",
    sureness: { ...match.sureness, parallel: "likely" },
    parallelOptions: [option, ...match.parallelOptions.filter((item) => item.name !== label)],
  };
}

/** A parallel's sales in one line: how many, and the newest price. */
function groupSummary(group: ParallelGroup) {
  const newest = [...group.sales].sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""))[0];
  return {
    label: group.label,
    nSales: group.sales.length,
    lastPriceCents: newest ? Math.round(newest.price * 100) : null,
    lastSoldAt: newest?.soldAt ?? null,
  };
}

function emptyDropped(): ScanSalesResult["dropped"] {
  return { junk: 0, player: 0, number: 0, run: 0, year: 0, grade: 0, removed: 0 };
}

function toCleanedSale(sale: ScanSale): CleanedSale {
  return {
    itemId: sale.itemId,
    title: sale.title,
    price: sale.price,
    currency: "USD",
    soldAt: sale.soldAt ?? "",
    grader: null,
    grade: null,
    url: "",
  };
}

