import type { OwnedCard } from "./types";

/**
 * Public cards are read for what a screen shows, not as one site-wide list.
 * A screen asks by card id, by owner, or by player name; the provider keeps
 * every row it has read, keyed by id, and remembers which requests are done.
 */
export type PublicCardRequest = {
  ids?: readonly (string | null | undefined)[];
  ownerId?: string | null;
  /** Exact player names, matched like search matches them (trim, any case). */
  players?: readonly (string | null | undefined)[];
};

export type PublicCardCache = {
  cards: ReadonlyMap<string, OwnedCard>;
  /** Request keys that finished, found or not. */
  settled: ReadonlySet<string>;
};

export function emptyPublicCardCache(): PublicCardCache {
  return { cards: new Map(), settled: new Set() };
}

function playerKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Stable, de-duplicated keys: id:…, owner:…, player:…. */
export function publicCardKeys(request: PublicCardRequest): string[] {
  const ids = [...new Set((request.ids ?? []).filter((id): id is string => Boolean(id)))].sort();
  const players = [
    ...new Set(
      (request.players ?? [])
        .filter((name): name is string => typeof name === "string")
        .map(playerKey)
        .filter(Boolean),
    ),
  ].sort();
  return [
    ...ids.map((id) => `id:${id}`),
    ...(request.ownerId ? [`owner:${request.ownerId}`] : []),
    ...players.map((name) => `player:${name}`),
  ];
}

export function publicCardsSettled(cache: PublicCardCache, keys: readonly string[]): boolean {
  return keys.every((key) => cache.settled.has(key));
}

/** Keys still to read: not settled and not already on the way. */
export function unsettledKeys(
  cache: PublicCardCache,
  keys: readonly string[],
  inflight: ReadonlySet<string>,
): string[] {
  return keys.filter((key) => !cache.settled.has(key) && !inflight.has(key));
}

/** Adds rows (a later read of the same card wins) and marks keys done. */
export function mergePublicCards(
  cache: PublicCardCache,
  cards: readonly OwnedCard[],
  keys: readonly string[],
): PublicCardCache {
  const next = new Map(cache.cards);
  for (const card of cards) next.set(card.id, card);
  return { cards: next, settled: new Set([...cache.settled, ...keys]) };
}

export function cardsForKeys(cache: PublicCardCache): OwnedCard[] {
  return [...cache.cards.values()];
}

/**
 * Collects the keys every screen part asks for in one tick into a single
 * read. A key that is on the way or already read is never asked again. A
 * failed read still settles its keys (with no rows), so nothing waits on it.
 */
export function createPublicCardBatcher(
  load: (keys: string[]) => Promise<OwnedCard[]>,
  settle: (cards: OwnedCard[], keys: string[]) => void,
) {
  const done = new Set<string>();
  const inflight = new Set<string>();
  let queue: string[] = [];
  let scheduled = false;
  return {
    request(keys: readonly string[]) {
      const fresh = keys.filter((key) => !done.has(key) && !inflight.has(key));
      if (fresh.length === 0) return;
      for (const key of fresh) {
        inflight.add(key);
        queue.push(key);
      }
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const batch = queue;
        queue = [];
        const finish = (cards: OwnedCard[]) => {
          for (const key of batch) {
            done.add(key);
            inflight.delete(key);
          }
          settle(cards, batch);
        };
        void load(batch).then(finish, () => finish([]));
      });
    },
  };
}
