import type { CatalogCard } from "@/lib/card-catalog";
import type { ProductRecord } from "@/lib/cards/product-data";
import { sharedCompValue } from "@/lib/comps/shared-value";
import type { CleanedSale, TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { toMatchCard, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { QuickCompLimitReason } from "@/lib/quick-comp/limits";
import { compIdentityFromMatch, scanCompGrade, type ScanCompResult } from "./comp";
import { type QuickCompCachedSale } from "./comp-lookup";
import { cleanCompFor, priceScanGroup } from "./clean-sales";
import {
  liveSearchLadder,
  rankScanMatches,
  scanPlayerName,
  type ScanMatch,
  type SoldTitle,
} from "./match";
import { comparableSales, ESTIMATE_MAX_CALLS, ESTIMATE_MIN_SALES, estimateFrom, estimateQueries, yearAgoParallels, type ScanEstimateResult } from "./estimate";
import { withListingPhotos } from "./listing-photo";
import { newLookupBudget, type LookupBudget } from "./live-search";
import { asTrawlResults, groupByParallel, groupFor, isUnnamedRunLabel, scanSalesFor, type ParallelGroup, type ScanSale, type ScanSalesResult } from "./scan-sales";
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
  /** The clock, for "this year's and last year's products". Defaults to now. */
  now?: () => number;
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
  /**
   * Only with "No sales yet" (the search worked and found none): an estimate from last year's
   * similar cards, and last year's parallels at this print run. Never this card's price, never saved.
   */
  similar?: ScanEstimateResult;
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
  // Every cached sale goes through the same filter as a live one: titles only, junk and grades out.
  try {
    const cached = await deps.quickCompCache(identity);
    if (cached && !cached.sample && cached.comps.length > 0) {
      const results = asTrawlResults(cached.comps.filter((comp) => comp.title).map((comp) => ({ title: comp.title!, price: comp.soldPrice, soldAt: comp.soldDate })));
      const result = cleanCompFor(identity, results, deps.directory, { serialRun: top.serialRun, asOf: cached.fetchedAt, source: "quick-comp" });
      if (result.status === "ok") return result;
    }
  } catch {
    // A failed cache read falls through to the saved listings, then a live search.
  }
  const saved = asTrawlResults(titles.map((item) => ({ title: item.title, price: Number(item.price), soldAt: item.soldAt ?? null })));
  const result = cleanCompFor(identity, saved, deps.directory, { serialRun: top.serialRun, asOf: newest(titles), source: "sold-cache" });
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
  // The listings the search returned also give each match a photo of that exact card. No extra search.
  const results: TrawlSoldResult[] = [];
  const found = await lookupSolds(input, userId, deps, results);
  return { ...found, matches: withListingPhotos(found.matches, results, deps.directory) };
}

async function lookupSolds(
  input: LiveSoldsInput,
  userId: string,
  deps: LiveSoldsDeps,
  results: TrawlSoldResult[],
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
      // Out of credits: no more Trawl calls this lookup, and nothing to show but that.
      if (budget.outOfCredits) return { matches, comp: { status: "unavailable" }, query: usedQuery };
      // One failed search never wipes out the others: try the next rung. "Unavailable" only when none answered.
      continue;
    }
    usedQuery = query;
    fetchedAt = live.fetchedAt;
    results.push(...live.results);
    // 3. The sold titles help finish the identity (set, #, parallel).
    matches = rank([...saved, ...liveTitles(results)]);
    const best = matches[0];
    found = best?.playerName ? scanSalesFor(best, { grade: scanCompGrade(best), setBrand: best.setBrand, parallel: best.parallel }, results, deps.directory) : found;
    deps.log?.({ rung: index, query, ok: true, results: live.results.length, kept: found.kept.length, dropped: found.dropped });
    if (found.kept.length > 0) break;
  }

  if (!usedQuery) return { matches, comp: { status: "unavailable" }, query: null };
  const best = matches[0];
  if (!best) return { matches: first, comp: { status: "none", searched: true }, query: usedQuery };
  // The player is still open (an unverified name no title carried): nothing is priced for nobody.
  if (!best.playerName) return { matches, comp: { status: "none", searched: true }, query: usedQuery };
  if (found.kept.length === 0) {
    // "No sales yet": the search worked and found none. Only then, last year's similar cards.
    const similar = await similarCards(best, userId, budget, deps);
    return { matches, comp: { status: "none", searched: true }, query: usedQuery, ...(similar ? { similar } : {}) };
  }

  // 4. Sales by parallel: the picked parallel's group, labelled. With the parallel open, only a group
  // that's most of the sales (2+) is priced, and the card takes its name; otherwise the groups show.
  const groups = groupByParallel(found.kept);
  const leader = groups[0];
  // An unnumbered card with its parallel open shows Base: priced from Base sales only, with the
  // other parallels offered to tap. Never Silver from a title majority.
  // An autograph or a named variation is never Base: its parallel stays open until its sales name it.
  if (!best.parallel && best.serialRun == null && !best.isAuto && !best.subset) {
    const base = groupFor(groups, "Base");
    if (!base) return { matches, comp: { status: "split", groups: groups.map(groupSummary), missing: "Base" }, query: usedQuery };
    const priced = priceScanGroup(base.sales, { asOf: fetchedAt || null, source: "live" });
    if (priced.status !== "ok") return { matches, comp: { status: "none", searched: true }, query: usedQuery };
    return {
      matches,
      comp: { ...priced, parallel: base.label, groups: groups.map((item) => ({ label: item.label, nSales: item.sales.length })) },
      query: usedQuery,
    };
  }
  if (!best.parallel && !isMajority(leader, found.kept.length)) {
    return { matches, comp: { status: "split", groups: groups.map(groupSummary) }, query: usedQuery };
  }
  // A colored group takes the card's parallel chip. A Base majority, or a numbered card's sales that
  // name no color ("/299, parallel not named"), leave it open.
  if (!best.parallel && leader.label !== "Base" && !isUnnamedRunLabel(leader.label)) matches = [withSalesParallel(best, leader.label), ...matches.slice(1)];
  const group = best.parallel ? groupFor(groups, best.parallel) : leader;
  if (!group) return { matches, comp: { status: "split", groups: groups.map(groupSummary) }, query: usedQuery };
  const comp = priceScanGroup(group.sales, { asOf: fetchedAt || null, source: "live" });
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

/**
 * Last year's similar cards for a card with no sales: at most ESTIMATE_MAX_CALLS more Trawl calls
 * on the same lookup (no second cap spent), none once Trawl says the account is out of credits.
 * A failed search here is just no estimate: the sheet still says "No sales yet".
 */
async function similarCards(best: ScanMatch, userId: string, budget: LookupBudget, deps: LiveSoldsDeps): Promise<ScanEstimateResult | null> {
  // Only this year's and last year's products: an older card with no sales spends no extra searches.
  const thisYear = new Date((deps.now ?? Date.now)()).getUTCFullYear();
  const cardYear = Number(/^(\d{4})/.exec(best.yearLabel)?.[1] ?? Number.NaN);
  if (!(cardYear >= thisYear - 1)) return null;
  const queries = estimateQueries(best);
  if (queries.length === 0 || budget.outOfCredits) return null;
  budget.maxCalls = budget.calls + ESTIMATE_MAX_CALLS;
  const results: TrawlSoldResult[] = [];
  let answered = false;
  for (const query of queries) {
    const live = await deps.liveSearch(query, userId, budget).catch((): LiveSearchResult => ({ ok: false, reason: "unavailable" }));
    if (!live.ok) {
      if (budget.outOfCredits || live.reason !== "unavailable") break;
      continue;
    }
    answered = true;
    results.push(...live.results);
    const sales = comparableSales(best, results, deps.directory);
    const narrowed = best.parallel ? sales.filter((sale) => sale.parallel.toLowerCase() === best.parallel.toLowerCase()) : sales;
    if (narrowed.length >= ESTIMATE_MIN_SALES) break;
  }
  if (!answered) return null;
  const sales = comparableSales(best, results, deps.directory);
  const estimate = estimateFrom(best, sales);
  const parallels = yearAgoParallels(best, sales);
  return estimate || parallels.length > 0 ? { estimate, parallels } : null;
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
  return { junk: 0, player: 0, number: 0, run: 0, year: 0, grade: 0, removed: 0, set: 0 };
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

