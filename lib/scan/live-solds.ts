import type { CatalogCard } from "@/lib/card-catalog";
import type { ProductRecord } from "@/lib/cards/product-data";
import { sharedCompValue } from "@/lib/comps/shared-value";
import type { CleanedSale, TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { toMatchCard, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { QuickCompLimitReason } from "@/lib/quick-comp/limits";
import { compIdentityFromMatch, scanCompGrade, summarizeSales, type ScanCompResult } from "./comp";
import { salesForCard } from "./comp-lookup";
import {
  liveSearchQuery,
  rankScanMatches,
  scanPlayerName,
  type ScanMatch,
  type SoldTitle,
} from "./match";
import { scanReadFrom, type ScanCapture } from "./session";

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
  quickCompCache: (identity: QuickCompIdentity) => Promise<{ comps: { soldPrice: number; soldDate: string }[]; fetchedAt: string | null; sample?: boolean } | null>;
  /** One Trawl sold search, shared per query. Spends the caps only on a miss. */
  liveSearch: (query: string, userId: string) => Promise<LiveSearchResult>;
  /** Puts this card's live sales in Quick Comp's shared cache. */
  storeQuickComp: (identity: QuickCompIdentity, sales: CleanedSale[], results: TrawlSoldResult[], meta: { query: string; fetchedAt: string }) => Promise<void>;
};

export type LiveSoldsInput = {
  capture: Pick<ScanCapture, "lines" | "backLines" | "kind">;
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
    if (cached && !cached.sample && cached.comps.length > 0) {
      const result = summarizeSales(
        cached.comps.map((comp) => ({ price: comp.soldPrice, soldAt: comp.soldDate })),
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

  // 2. One live search, built from what we know.
  const query = liveSearchQuery(read, top, deps.directory);
  if (!query) return { matches: first, comp: { status: "none" }, query: null };
  const live = await deps.liveSearch(query, userId).catch((): LiveSearchResult => ({ ok: false, reason: "unavailable" }));
  if (!live.ok) {
    if (live.reason === "daily" || live.reason === "hourly") {
      return { matches: first, comp: { status: "limited", reason: live.reason, resetAt: live.resetAt }, query: null };
    }
    return { matches: first, comp: { status: "unavailable" }, query: null };
  }

  // 3. The sold titles help finish the identity.
  const matches = rank([...saved, ...liveTitles(live.results)]);
  const best = matches[0];
  const identity = best ? identityOf(best) : null;
  if (!best || !identity) return { matches: matches.length > 0 ? matches : first, comp: { status: "none", searched: true }, query };

  // 4. Only this exact card's sales, stored for the next scan or Quick Comp.
  const sales = liveSalesFor(best, identity, live.results);
  try {
    await deps.storeQuickComp(identity, sales, live.results, { query, fetchedAt: live.fetchedAt });
  } catch {
    // The prices still show; the next scan searches again.
  }
  const comp = summarizeSales(
    sales.map((sale) => ({ price: sale.price, soldAt: sale.soldAt })),
    { asOf: live.fetchedAt, source: "live" },
  );
  return { matches, comp: comp.status === "none" ? { status: "none", searched: true } : comp, query };
}

