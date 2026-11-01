import type { CatalogCard } from "@/lib/card-catalog";
import { catalogSearchQuery } from "@/lib/card-search-query";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

type RpcRow = {
  id: string;
  player: string;
  year_label: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel: string | null;
  sport: string | null;
  is_rookie?: boolean | null;
};

function rowToCard(row: RpcRow): CatalogCard {
  return {
    id: row.id,
    playerName: row.player,
    yearLabel: row.year_label ?? "",
    setBrand: row.set_name ?? "",
    cardNumber: row.card_number ?? "",
    sport: row.sport ?? "",
    parallel: row.parallel || "Base",
    isRookie: row.is_rookie === true,
  };
}

/** Arguments for search_cards. q is clipped on whole characters. */
export function buildSearchCardsArgs(query: string): { q: string; max_results: number } {
  return {
    q: Array.from(catalogSearchQuery(query)).slice(0, 100).join(""),
    max_results: 20,
  };
}

/**
 * Add Card's catalog query. Search uses this same call.
 * Null means the RPC failed or the browser has no Supabase client.
 * An empty array is a real miss. Only card_catalog rows come back.
 */
export async function searchCatalogRemote(
  query: string,
  signal: AbortSignal,
): Promise<CatalogCard[] | null> {
  const supabase = await loadSupabaseBrowser();
  if (!supabase) return null;

  const builder = supabase.rpc("search_cards", buildSearchCardsArgs(query));

  const withAbort =
    typeof (builder as { abortSignal?: (s: AbortSignal) => typeof builder })
      .abortSignal === "function"
      ? (
          builder as { abortSignal: (s: AbortSignal) => typeof builder }
        ).abortSignal(signal)
      : builder;

  const { data, error } = await withAbort;
  if (signal.aborted) return null;
  if (error) {
    console.warn("search_cards rpc failed, using local fallback", error.message);
    return null;
  }
  return ((data as RpcRow[]) ?? []).map(rowToCard);
}
