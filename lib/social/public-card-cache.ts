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
  /** Request keys that read fine, found or not. */
  settled: ReadonlySet<string>;
  /** Request keys whose last read failed. Never settled: asking again reads again. */
  failed: ReadonlySet<string>;
};

export function emptyPublicCardCache(): PublicCardCache {
  return { cards: new Map(), settled: new Set(), failed: new Set() };
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

/** Any of these keys' last read failed (and none has read fine since). */
export function publicCardsFailed(cache: PublicCardCache, keys: readonly string[]): boolean {
  return keys.some((key) => cache.failed.has(key) && !cache.settled.has(key));
}

/** Marks keys whose read failed. They stay unsettled, so no screen calls them missing. */
export function failPublicCards(cache: PublicCardCache, keys: readonly string[]): PublicCardCache {
  return { ...cache, failed: new Set([...cache.failed, ...keys]) };
}

/** Asking again: these keys are on the way, not failed. */
export function retryPublicCards(cache: PublicCardCache, keys: readonly string[]): PublicCardCache {
  if (!keys.some((key) => cache.failed.has(key))) return cache;
  const failed = new Set(cache.failed);
  for (const key of keys) failed.delete(key);
  return { ...cache, failed };
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
  const failed = new Set(cache.failed);
  for (const key of keys) failed.delete(key);
  return { cards: next, settled: new Set([...cache.settled, ...keys]), failed };
}

export function cardsForKeys(cache: PublicCardCache): OwnedCard[] {
  return [...cache.cards.values()];
}

/**
 * Collects the keys every screen part asks for in one tick into a single
 * read. A key that is on the way or already read is never asked again. A
 * failed read is reported with `fail` and stays retryable: its keys leave
 * the on-the-way set but are never marked done, so the next ask reads again.
 * `reset` forgets every key (a new viewer, a refresh) and drops reads that
 * were already on the way, so an old viewer's rows never land.
 */
export function createPublicCardBatcher(
  load: (keys: string[]) => Promise<OwnedCard[]>,
  settle: (cards: OwnedCard[], keys: string[]) => void,
  fail: (keys: string[]) => void,
) {
  const done = new Set<string>();
  const inflight = new Set<string>();
  let queue: string[] = [];
  let scheduled = false;
  let generation = 0;
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
      const asked = generation;
      queueMicrotask(() => {
        scheduled = false;
        if (asked !== generation) return;
        const batch = queue;
        queue = [];
        const current = () => asked === generation;
        void load(batch).then(
          (cards) => {
            if (!current()) return;
            for (const key of batch) {
              done.add(key);
              inflight.delete(key);
            }
            settle(cards, batch);
          },
          () => {
            if (!current()) return;
            for (const key of batch) inflight.delete(key);
            fail(batch);
          },
        );
      });
    },
    reset() {
      generation += 1;
      done.clear();
      inflight.clear();
      queue = [];
      scheduled = false;
    },
  };
}
