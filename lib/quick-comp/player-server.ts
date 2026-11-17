import "server-only";

import { unstable_cache } from "next/cache";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { getCompsSource } from "@/lib/comps";
import { fetchTrawlSold, getTrawlApiKey } from "@/lib/comps/trawl";
import { makeLiveSearch } from "@/lib/scan/live-search";
import { readLiveCache } from "@/lib/scan/live-solds-server";
import type { CacheFn } from "./cache";
import { serverPlayerSearchLimits } from "./limits-server";
import { searchCachedSoldTitles } from "@/lib/scan/sold-titles-server";
import { getAuthUserId } from "@/lib/supabase/server";
import namesFile from "./data/player-names.json";
import { quickCompEnabled } from "./flag";
import { nameKey, type PlayerNameRow } from "./player-names";
import type { PlayerFeedDeps, PlayerSuggestDeps } from "./player-respond";
import { playerSearchQuery } from "./player-respond";
import { playerSalesFrom } from "./player-sales";
import { indexNames, suggestPlayerNames, titlePhrases, type NameIndex } from "./player-suggest";

let index: NameIndex | null = null;
let byKey: Map<string, string> | null = null;
function nameIndex(): NameIndex {
  index ??= indexNames(namesFile as PlayerNameRow[]);
  return index;
}
function canonical(text: string): string | null {
  byKey ??= new Map(nameIndex().map((entry) => [entry.key, entry.name]));
  return byKey.get(nameKey(text)) ?? null;
}

/** Saved titles (sold_comps_cache) plus a player search already in the shared cache. Neither spends a cap or calls Trawl; kept an hour per player. */
const savedTitles = unstable_cache(
  async (player: string): Promise<string[]> => {
    const [saved, live] = await Promise.all([
      searchCachedSoldTitles(player).catch(() => []),
      readLiveCache(playerSearchQuery(player)).catch(() => null),
    ]);
    return [...saved.map((row) => row.title), ...(live ?? []).map((row) => row.title)];
  },
  ["quick-comp-player-titles-v1"],
  { revalidate: 3600 },
);

/** Our existing sold search (same query, same shared 6-hour cache), spending player search's own caps on a miss. */
const playerLiveSearch = makeLiveSearch({
  source: getCompsSource,
  hasTrawlKey: () => Boolean(getTrawlApiKey()),
  fetchSold: fetchTrawlSold,
  limits: serverPlayerSearchLimits,
  cache: unstable_cache as CacheFn,
  now: Date.now,
  warn: (event) => console.warn("[player-search] search failed", JSON.stringify(event)),
});

export const serverPlayerFeedDeps: PlayerFeedDeps = {
  enabled: () => quickCompEnabled(),
  userId: getAuthUserId,
  canonical,
  liveSearch: (query, userId) => playerLiveSearch(query, userId),
  toSales: (results, player) => playerSalesFrom(results, player, SCAN_DIRECTORY),
};

export const serverPlayerSuggestDeps: PlayerSuggestDeps = {
  enabled: () => quickCompEnabled(),
  userId: getAuthUserId,
  names: (text) => suggestPlayerNames(text, nameIndex()),
  titles: savedTitles,
  phrases: (player, titles) => titlePhrases(player, titles),
};
