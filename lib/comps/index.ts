import "server-only";

import { mockValueHistory } from "@/lib/value-history";
import { notifyMatchedSales } from "@/lib/wants/dispatch";
import { fairLowFromPrices } from "@/lib/wants/effective-target";
import {
  listCachedItemIds,
  readLatestSoldCompsBatch,
  readSoldCompsCache,
  writeSoldCompsCache,
} from "./cache";
import { keptAndDroppedTitles } from "./classify-titles";
import { trawlSkipReason, type TrawlSkipReason } from "./lookup-guard";
import { isLowConfidence } from "./clean";
import { cleanedToCompListings, historyFromSales } from "./map";
import {
  buildSoldSearchQuery,
  type MatchCard,
} from "./match";
import { buildQueryKey } from "./query-key";
import { mockCompsForCard } from "./sample";
import {
  cachedCompValue,
  compListingToCleaned,
  screenValueFromComps,
  sharedCompValue,
} from "./shared-value";
import { fetchTrawlSold, getTrawlApiKey } from "./trawl";
import type { CleanedSale, SoldCompCard, SoldCompsPayload } from "./types";

export type { CleanedSale, SoldCompCard, SoldCompsPayload } from "./types";
export { isLowConfidence } from "./clean";
export { filterComps, buildCompsQuery, prepareSales } from "./match";
export { sharedCompValue, screenValueFromComps } from "./shared-value";
export { buildQueryKey } from "./query-key";
export { trawlSkipReason, type TrawlSkipReason } from "./lookup-guard";
export { filterPriceOutliers } from "./stats";

export type CompsSource = "trawl" | "sample" | "off";

export type CompClassification = {
  keptTitles: string[];
  droppedTitles: string[];
  matched: number;
};

export type GetSoldCompsOptions = {
  /** Called on cache miss before any work (counts toward request limit). */
  beforeRequest?: () => Promise<boolean>;
  /** Called only when about to hit Trawl (cache miss). Return false to abort with rate limit. */
  beforeTrawl?: () => Promise<boolean>;
  /** Price the latest stored batch and do not call Trawl, even if that batch is stale. */
  cacheOnly?: boolean;
  /** Titles kept and dropped by the shared filter. Does not change the price. */
  onClassified?: (info: CompClassification) => void;
};

function reportClassification(
  options: GetSoldCompsOptions | undefined,
  input: ReadonlyArray<{ title?: string | null; itemId?: string | null; item_id?: string | null }>,
  kept: CleanedSale[],
) {
  if (!options?.onClassified) return;
  const titles = keptAndDroppedTitles(input, kept);
  options.onClassified({ ...titles, matched: kept.length });
}

export type GetSoldCompsResult =
  | { ok: true; payload: SoldCompsPayload }
  | { ok: false; rateLimited: true }
  | { ok: false; unavailable: true; skipped?: TrawlSkipReason };

export function getCompsSource(): CompsSource {
  const raw = process.env.COMPS_SOURCE?.trim().toLowerCase();
  if (raw === "trawl" || raw === "sample" || raw === "off") return raw;
  return "sample";
}

function toMatchCard(card: SoldCompCard): MatchCard {
  return {
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    noNumber: card.noNumber,
    parallel: card.parallel,
    serialRun: card.serialRun,
    isAuto: card.isAuto,
    isRelic: card.isRelic,
    conditionType: card.conditionType,
    grade: card.grade,
    gradeQualifier: card.gradeQualifier,
    sport: card.sport,
  };
}

export function samplePayload(card: SoldCompCard): SoldCompsPayload {
  const matchCard = toMatchCard(card);
  const mocks = mockCompsForCard({
    playerName: card.playerName,
    year: card.year,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber || "—",
    estimatedSellPrice: card.estimatedSellPrice ?? 120,
  });
  const valued = sharedCompValue(matchCard, mocks.map(compListingToCleaned));
  const priced = screenValueFromComps(cleanedToCompListings(valued.sales));
  return {
    comps: priced.comps,
    history: mockValueHistory({
      id: card.id || `${card.playerName}-${card.year}-${card.setBrand}`,
      estimatedSellPrice: priced.median ?? mocks[0]?.soldPrice ?? 120,
      purchasePrice: priced.comps[0]?.soldPrice ?? mocks[0]?.soldPrice ?? 100,
    }),
    median: priced.median,
    p25: priced.low,
    p75: priced.high,
    count: priced.count,
    source: getCompsSource() === "off" ? "off" : "sample",
    cached: false,
    fetchedAt: null,
    query: buildSoldSearchQuery(matchCard),
    lowConfidence: isLowConfidence(priced.count),
    sample: true,
  };
}

export function payloadFromSales(
  sales: CleanedSale[],
  opts: {
    source: "trawl";
    cached: boolean;
    fetchedAt: string | null;
    query: string;
  },
): SoldCompsPayload {
  const priced = screenValueFromComps(cleanedToCompListings(sales));
  return {
    comps: priced.comps,
    history: historyFromSales(sales),
    median: priced.median,
    p25: priced.low,
    p75: priced.high,
    count: priced.count,
    source: opts.source,
    cached: opts.cached,
    fetchedAt: opts.fetchedAt,
    query: opts.query,
    lowConfidence: isLowConfidence(priced.count),
    sample: false,
  };
}

/**
 * Generic sold-comps resolver. Trawl key stays server-side.
 * A fresh Trawl lookup runs sharedCompValue (match + one outlier pass) and
 * stores those sales. Cached sales re-apply the match rules only
 * (cachedCompValue), so the outlier pass never runs twice and a cached price
 * equals the fresh one.
 * Cards that cannot use a lookup (sold, no card number, unparsed grade) never
 * reach Trawl: they get stored comps only, else unavailable with `skipped`.
 */
export async function getSoldComps(
  card: SoldCompCard,
  options?: GetSoldCompsOptions,
): Promise<GetSoldCompsResult> {
  const source = getCompsSource();
  if (source === "sample" || source === "off") {
    const payload = samplePayload(card);
    options?.onClassified?.({
      keptTitles: payload.comps.map((comp) => comp.title),
      droppedTitles: [],
      matched: payload.count,
    });
    return { ok: true, payload };
  }

  const matchCard = toMatchCard(card);
  const query = buildSoldSearchQuery(matchCard);
  if (!query || !card.id) {
    return { ok: false, unavailable: true };
  }

  if (!getTrawlApiKey()) {
    return { ok: false, unavailable: true };
  }

  const queryKey = buildQueryKey(card);
  const cached = await readSoldCompsCache(queryKey);
  if (cached) {
    // Re-match cached rows with the current rules. They already had their outlier pass.
    const sales = cachedCompValue(matchCard, cached.sales).sales;
    reportClassification(options, cached.sales, sales);
    return {
      ok: true,
      payload: payloadFromSales(sales, {
        source: "trawl",
        cached: true,
        fetchedAt: cached.fetchedAt,
        query,
      }),
    };
  }

  // A card that cannot use a lookup gets its stored comps only, like cacheOnly.
  const skipped = trawlSkipReason(card);
  if (options?.cacheOnly || skipped) {
    const stale = await readLatestSoldCompsBatch(queryKey);
    if (!stale) {
      return skipped ? { ok: false, unavailable: true, skipped } : { ok: false, unavailable: true };
    }
    const sales = cachedCompValue(matchCard, stale.sales).sales;
    reportClassification(options, stale.sales, sales);
    return {
      ok: true,
      payload: payloadFromSales(sales, {
        source: "trawl",
        cached: true,
        fetchedAt: stale.fetchedAt,
        query,
      }),
    };
  }

  if (options?.beforeRequest) {
    const allowed = await options.beforeRequest();
    if (!allowed) return { ok: false, rateLimited: true };
  }

  if (options?.beforeTrawl) {
    const allowed = await options.beforeTrawl();
    if (!allowed) return { ok: false, rateLimited: true };
  }

  try {
    const result = await fetchTrawlSold(query, { days: 90, maxPages: 1 });

    if (!result.ok) {
      return { ok: false, unavailable: true };
    }

    const results = result.body.results ?? [];
    const sales = sharedCompValue(matchCard, results).sales;
    reportClassification(options, results, sales);
    const previousIds = await listCachedItemIds(queryKey);
    const writtenAt = await writeSoldCompsCache(card.id, queryKey, sales);
    const fetchedAt = writtenAt ?? new Date().toISOString();

    if (writtenAt && previousIds) {
      const fresh = sales.filter(
        (sale) => sale.itemId && sale.itemId !== "__empty__" && !previousIds.has(sale.itemId),
      );
      if (fresh.length > 0) {
        try {
          await notifyMatchedSales(
            card,
            fresh,
            fairLowFromPrices(sales.map((sale) => sale.price)),
          );
        } catch (err) {
          console.warn(
            "[want_alerts]",
            err instanceof Error ? err.message : "sale alerts failed",
          );
        }
      }
    }

    return {
      ok: true,
      payload: payloadFromSales(sales, {
        source: "trawl",
        cached: false,
        fetchedAt,
        query,
      }),
    };
  } catch (err) {
    console.warn(
      "[comps] Trawl error:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, unavailable: true };
  }
}
