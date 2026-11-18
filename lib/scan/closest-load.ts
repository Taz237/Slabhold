import type { ClosestCard, PlayerCards } from "./closest";

/**
 * Loads one sport's player-cards list on demand (lib/cards/data/player-cards/, built by
 * scripts/build-player-cards.ts). Only a scan that read a player and nothing else asks for it, so
 * it is never in a page's first load. Kept after its first load; a failed load is tried again.
 */
const loaded = new Map<string, Promise<PlayerCards | null>>();

const SPORTS = new Set(["baseball", "basketball", "football", "hockey"]);

export function loadPlayerCards(sport: string): Promise<PlayerCards | null> {
  const file = sport.trim().toLowerCase();
  if (!SPORTS.has(file)) return Promise.resolve(null);
  let pending = loaded.get(file);
  if (!pending) {
    pending = import(`@/lib/cards/data/player-cards/${file}.json`)
      .then((mod) => ((mod as { default?: unknown }).default ?? mod) as PlayerCards)
      .catch(() => {
        loaded.delete(file);
        return null;
      });
    loaded.set(file, pending);
  }
  return pending;
}

/** GET /api/scan/confirmed: the cards other collectors confirmed for this read. Empty on any failure. */
export async function fetchConfirmedCards(readKey: string, signal?: AbortSignal): Promise<ClosestCard[]> {
  if (!readKey) return [];
  try {
    const response = await fetch(`/api/scan/confirmed?${new URLSearchParams({ key: readKey })}`, { cache: "no-store", signal });
    if (!response.ok) return [];
    const body = (await response.json()) as { cards?: unknown };
    return Array.isArray(body.cards) ? (body.cards as ClosestCard[]) : [];
  } catch {
    return [];
  }
}
