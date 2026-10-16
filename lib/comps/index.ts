import "server-only";

import { mockValueHistory } from "@/lib/value-history";
import { readSoldCompsCache, writeSoldCompsCache } from "./cache";
import { isLowConfidence } from "./clean";
import { cleanedToCompListings, historyFromSales } from "./map";
import {
  buildSoldSearchQuery,
  filterComps,
  type MatchCard,
} from "./match";
import { buildQueryKey } from "./query-key";
import { mockCompsForCard } from "./sample";
import { middleFifty } from "./stats";
import { fetchTrawlSold, getTrawlApiKey } from "./trawl";
import type { CleanedSale, SoldCompCard, SoldCompsPayload } from "./types";

export type { CleanedSale, SoldCompCard, SoldCompsPayload } from "./types";
export { isLowConfidence } from "./clean";
export { filterComps, buildCompsQuery, prepareSales } from "./match";
export { buildQueryKey } from "./query-key";
export { filterPriceOutliers } from "./stats";

export type CompsSource = "trawl" | "sample" | "off";

export type GetSoldCompsOptions = {
  /** Called on cache miss before any work (counts toward request limit). */
  beforeRequest?: () => Promise<boolean>;
  /** Called only when about to hit Trawl (cache miss). Return false to abort with rate limit. */
  beforeTrawl?: () => Promise<boolean>;
};

export type GetSoldCompsResult =
  | { ok: true; payload: SoldCompsPayload }
  | { ok: false; rateLimited: true }
  | { ok: false; unavailable: true };

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
  };
}

function samplePayload(card: SoldCompCard): SoldCompsPayload {
  const comps = mockCompsForCard({
    playerName: card.playerName,
    year: card.year,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber || "—",
    estimatedSellPrice: card.estimatedSellPrice ?? 120,
  });
  const prices = comps.map((c) => c.soldPrice);
  const stats = middleFifty(prices);
  return {
    comps,
    history: mockValueHistory({
      id: card.id || `${card.playerName}-${card.year}-${card.setBrand}`,
      estimatedSellPrice: stats.median ?? comps[0]?.soldPrice ?? 120,
      purchasePrice: comps[0]?.soldPrice ?? 100,
    }),
    median: stats.median != null ? Math.round(stats.median) : null,
    p25: stats.p25 != null ? Math.round(stats.p25) : null,
    p75: stats.p75 != null ? Math.round(stats.p75) : null,
    count: comps.length,
    source: getCompsSource() === "off" ? "off" : "sample",
    cached: false,
    fetchedAt: null,
    query: buildSoldSearchQuery(toMatchCard(card)),
    lowConfidence: isLowConfidence(comps.length),
    sample: true,
  };
}

function payloadFromSales(
  sales: CleanedSale[],
  opts: {
    source: "trawl";
    cached: boolean;
    fetchedAt: string | null;
    query: string;
  },
): SoldCompsPayload {
  const comps = cleanedToCompListings(sales);
  const prices = comps.map((c) => c.soldPrice);
  const stats = middleFifty(prices);
  return {
    comps,
    history: historyFromSales(sales),
    median: stats.median != null ? Math.round(stats.median) : null,
    p25: stats.p25 != null ? Math.round(stats.p25) : null,
    p75: stats.p75 != null ? Math.round(stats.p75) : null,
    count: comps.length,
    source: opts.source,
    cached: opts.cached,
    fetchedAt: opts.fetchedAt,
    query: opts.query,
    lowConfidence: isLowConfidence(comps.length),
    sample: false,
  };
}

/**
 * Generic sold-comps resolver. Trawl key stays server-side.
 * Always re-applies filterComps (shared with refreshCardValue).
 */
export async function getSoldComps(
  card: SoldCompCard,
  options?: GetSoldCompsOptions,
): Promise<GetSoldCompsResult> {
  const source = getCompsSource();
  if (source === "sample" || source === "off") {
    return { ok: true, payload: samplePayload(card) };
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
    // Re-filter cached rows with the current shared rules.
    const sales = filterComps(matchCard, cached.sales);
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

    const sales = filterComps(matchCard, result.body.results ?? []);
    const fetchedAt =
      (await writeSoldCompsCache(card.id, queryKey, sales)) ??
      new Date().toISOString();

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
