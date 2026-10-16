import "server-only";

import { mockValueHistory } from "@/lib/value-history";
import {
  readSoldCompsCache,
  readSoldCompsCacheAny,
  writeSoldCompsCache,
} from "./cache";
import { cleanTrawlResults } from "./clean";
import { cleanedToCompListings, historyFromSales } from "./map";
import { mockCompsForCard } from "./sample";
import { middleFifty } from "./stats";
import { buildSoldQuery, fetchTrawlSold, getTrawlApiKey } from "./trawl";
import type { SoldCompCard, SoldCompsPayload } from "./types";

export type { CleanedSale, SoldCompCard, SoldCompsPayload } from "./types";

export type CompsSource = "trawl" | "sample" | "off";

export function getCompsSource(): CompsSource {
  const raw = process.env.COMPS_SOURCE?.trim().toLowerCase();
  if (raw === "trawl" || raw === "sample" || raw === "off") return raw;
  return "sample";
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
    median: stats.median,
    p25: stats.p25,
    p75: stats.p75,
    count: comps.length,
    source: getCompsSource() === "off" ? "off" : "sample",
    cached: false,
    fetchedAt: null,
    query: buildSoldQuery(card),
    lowConfidence: comps.length < 5,
    sample: true,
  };
}

function payloadFromSales(
  sales: Parameters<typeof cleanedToCompListings>[0],
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
    lowConfidence: comps.length > 0 && comps.length < 5,
    sample: false,
  };
}

/**
 * Generic sold-comps resolver. Trawl key stays server-side.
 * Kill switch: COMPS_SOURCE = trawl | sample | off (default sample).
 */
export async function getSoldComps(card: SoldCompCard): Promise<SoldCompsPayload> {
  const source = getCompsSource();
  if (source === "sample" || source === "off") {
    return samplePayload(card);
  }

  const query = buildSoldQuery(card);
  if (!query || !card.id) {
    return samplePayload(card);
  }

  if (!getTrawlApiKey()) {
    return samplePayload(card);
  }

  const cached = await readSoldCompsCache(card.id);
  if (cached) {
    return payloadFromSales(cached.sales, {
      source: "trawl",
      cached: true,
      fetchedAt: cached.fetchedAt,
      query,
    });
  }

  try {
    const result = await fetchTrawlSold(query, { days: 90, maxPages: 1 });

    if (!result.ok) {
      if (result.outOfCredits || result.status === 429) {
        const stale = await readSoldCompsCacheAny(card.id);
        if (stale) {
          return payloadFromSales(stale.sales, {
            source: "trawl",
            cached: true,
            fetchedAt: stale.fetchedAt,
            query,
          });
        }
      }
      return samplePayload(card);
    }

    const sales = cleanTrawlResults(result.body.results ?? [], card.grade);
    const fetchedAt =
      (await writeSoldCompsCache(card.id, sales)) ?? new Date().toISOString();

    return payloadFromSales(sales, {
      source: "trawl",
      cached: false,
      fetchedAt,
      query,
    });
  } catch (err) {
    console.warn(
      "[comps] Trawl error:",
      err instanceof Error ? err.message : err,
    );
    const stale = await readSoldCompsCacheAny(card.id);
    if (stale) {
      return payloadFromSales(stale.sales, {
        source: "trawl",
        cached: true,
        fetchedAt: stale.fetchedAt,
        query,
      });
    }
    return samplePayload(card);
  }
}
