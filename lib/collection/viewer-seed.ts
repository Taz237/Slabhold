import type { SnapshotRow } from "@/lib/collection/value-series";
import type { Profile } from "@/lib/social/types";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

/**
 * A signed-in screen's first paint, read on the server for this request only
 * (never cached): the viewer and their cards, as the providers would load
 * them. The client draws from it until the providers have their own.
 */
export type ViewerSeed = {
  viewer: Profile;
  cards: SportsCard[];
};

/** Collection's first screen: the cards plus the header's values and chart. */
export type CollectionSeed = ViewerSeed & {
  /** Null when the price check was rate-limited: the browser asks as before. */
  values: Record<string, CardValueResult> | null;
  snapshots: SnapshotRow[];
  /** Null when the history table can't be read: Top movers uses the price paid. */
  cardHistory: [string, { date: string; value: number }[]][] | null;
};

/** The key useCardValues keeps for a set of card ids. */
export function cardValuesKey(ids: readonly string[]): string {
  return [...new Set(ids.filter(Boolean))].sort().join(",");
}
